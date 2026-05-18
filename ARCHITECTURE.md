# EduPortal Architecture

## System Context

EduPortal is the public-facing web layer of the EduAnalytics ecosystem. It serves four user roles — Admin, Teacher, Student, Parent — each with a dedicated dashboard and feature set. The portal is deployed on Vercel and backed by Supabase PostgreSQL.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Mobile                      │
│  Parent  │  Learner  │  Teacher  │  Admin  │  Public Visitor │
└────────────────────────────┬──────────────────────────────────┘
                             │ HTTPS
              ┌──────────────┴──────────────┐
              │       Vercel Edge Network    │
              │  ┌────────────────────────┐   │
              │  │   Next.js 16 App Router │   │
              │  │  (React Server Components)│  │
              │  └────────────────────────┘   │
              │              │                  │
              │  ┌───────────┴───────────┐      │
              │  │  Auth.js (NextAuth v5)│      │
              │  │  JWT + Credentials      │      │
              │  └───────────┬───────────┘      │
              │              │                  │
              │  ┌───────────┴───────────┐      │
              │  │  Vercel AI SDK        │      │
              │  │  Groq / Gemini        │      │
              │  └───────────┬───────────┘      │
              │              │                  │
              │  ┌───────────┴───────────┐      │
              │  │  Prisma ORM + Adapter │      │
              │  │  (@prisma/adapter-pg) │      │
              │  └───────────┬───────────┘      │
              └──────────────┼──────────────────┘
                             │
                    ┌────────┴────────┐
                    │  Supabase       │
                    │  PostgreSQL     │
                    │  (managed)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              │    EduAnalytics Sync       │
              │    (PySide6 desktop app)   │
              │    via eaLearnerNumber     │
              │                            │
              └────────────────────────────┘
```

For the full cross-system architecture diagram including the EduAnalytics desktop layer, external AI providers, and WhatsApp/Gmail integrations, see the [EduAnalytics Showcase ARCHITECTURE.md](https://github.com/machetheDM/edu-analytics-showcase/blob/main/ARCHITECTURE.md).

---

## Data Flow

### 1. Authentication Flow

```
User ──POST /login────→ NextAuth Credentials Provider
                              │
                              ▼
                        Prisma: findUnique({ email })
                              │
                              ▼
                        bcrypt.compare(password, hash)
                              │
                              ▼
                        JWT created with { id, email, name, role }
                              │
                              ▼
                        Cookie set (httpOnly, secure)
                              │
                              ▼
                        Redirect to role-matched dashboard
```

### 2. AI Chat Flow

```
User ──POST /api/chat──→ auth() session check
                              │
                              ▼
                        ChatUsage rate-limit check (20/day)
                              │
                              ▼
                        buildUserContext(role, userId)
                              │
                        ┌───┴───┐
                        ▼       ▼
                   STUDENT   PARENT
                        │       │
                        ▼       ▼
                   Prisma:   Prisma:
                   marks +   learners[]
                   attend.   + marks
                        │       │
                        └───┬───┘
                            ▼
                   APS calculation
                   At-risk detection
                            │
                            ▼
                   SYSTEM_PROMPT + userContext
                            │
                            ▼
                   generateText({ model: groq("llama-3.3-70b"), ... })
                            │
                            ▼
                   ChatUsage.upsert({ count++ })
                            │
                            ▼
                   JSON response: { text, usage }
```

### 3. Scheduled Publishing Flow (Vercel Cron)

```
Vercel Cron ──GET /api/cron/publish──→ Authorization: Bearer CRON_SECRET
                                              │
                                              ▼
                                        Header validation
                                              │
                                              ▼
                                        Promise.all([
                                          prisma.news.updateMany(...),
                                          prisma.event.updateMany(...)
                                        ])
                                              │
                                              ▼
                                        JSON: { newsPublished, eventsPublished }
```

---

## Internal Architecture

### Directory Structure

```
src/
├── app/
│   ├── page.tsx              # Marketing landing (public)
│   ├── layout.tsx            # Root layout + providers + global widgets
│   ├── globals.css           # Tailwind imports + custom CSS
│   ├── login/                # Auth page
│   ├── admin/                # Admin dashboard + user management
│   ├── teacher/              # Teacher dashboard + marks capture
│   ├── student/              # Student dashboard + marks view
│   ├── parent/               # Parent dashboard + child tracking
│   ├── api/
│   │   ├── auth/[...nextauth]  # NextAuth API route
│   │   ├── chat/route.ts       # AI chat endpoint
│   │   ├── cron/publish/       # Scheduled publishing
│   │   └── ...
│   └── ...
├── components/
│   ├── charts/               # Recharts wrappers
│   ├── chatbot/              # Floating AI widget
│   ├── layout/               # Navbar, Footer
│   ├── providers/            # SessionProvider, ThemeProvider
│   └── ui/                   # shadcn/ui components + custom
├── lib/
│   └── prisma.ts             # Singleton PrismaClient
├── auth.ts                   # NextAuth instance with Credentials provider
├── auth.config.ts            # Route protection + JWT callbacks
└── generated/prisma/         # Prisma Client (generated)
```

---

## Concurrency & Serverless

- **PrismaClient singleton**: Global caching in development prevents connection exhaustion; fresh instance per request in production serverless
- **Connection pooling**: Supabase PostgreSQL handles pooling at the database level
- **Edge runtime**: NextAuth callbacks and API routes run in Node.js runtime (`"nodejs"`), not Edge, to support Prisma + bcrypt
- **Cron isolation**: Vercel Cron invocations are separate serverless executions, stateless by design

---

## Security Architecture

| Layer | Mechanism |
|-------|-----------|
| Authentication | NextAuth v5 + bcryptjs + JWT sessions |
| Authorization | Route-prefix matching in `authorized` callback |
| API Protection | `CRON_SECRET` bearer token for cron endpoints |
| Database | Row-level security via application-layer Prisma queries (no raw SQL) |
| Secrets | All credentials via `.env` — never committed |
| Session | httpOnly, secure cookies; JWT stored server-side |

---

## AI Integration

### Groq Provider
- Model: `llama-3.3-70b-versatile`
- Used for: general chatbot responses, school policy Q&A
- SDK: `@ai-sdk/groq` via Vercel AI SDK

### Google Gemini Provider
- Available in the same codebase for fallback / multimodal
- SDK: `@ai-sdk/google`

### Context Injection Pattern
The chat endpoint does not send a static prompt. It:
1. Reads the user's role from the JWT session
2. Queries Prisma for that user's live data (marks, attendance, goals)
3. Computes APS, pass type, at-risk subjects
4. Injects all of this into the system prompt as structured text
5. Calls the LLM with the enriched prompt

This means the AI can answer "What is my APS?" or "Which subjects am I failing?" with real data, not generic advice.

---

## External Integrations

| System | Integration File | Purpose |
|--------|-----------------|---------|
| Supabase PostgreSQL | `lib/prisma.ts` | Managed cloud database |
| Groq Cloud | `app/api/chat/route.ts` | LLM inference |
| Google Gemini | `package.json` (available) | Fallback LLM provider |
| Vercel AI SDK | `app/api/chat/route.ts` | Unified AI interface |
| Vercel Cron | `app/api/cron/publish/route.ts` | Scheduled content publishing |
| EduAnalytics | Sync bridge via `eaLearnerNumber` | Bi-directional data sync |

---

## Deployment Notes

1. **Install**: `npm install` (triggers `prisma generate` post-install)
2. **Environment**: `.env` must contain `DATABASE_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET`, `GROQ_API_KEY`
3. **Database**: Prisma migrations against Supabase PostgreSQL
4. **Build**: `next build` — static optimization for public pages, SSR for protected routes
5. **Cron**: Configure `vercel.json` cron schedule pointing to `/api/cron/publish`

---

## Future Roadmap

- [ ] RAG chatbot with vector store (FAISS/Chroma) for school policy retrieval
- [ ] WhatsApp Business API integration for parent notifications
- [ ] Real-time sync WebSocket layer for live mark updates
- [ ] Mobile PWA with offline mark viewing
- [ ] Analytics dashboard with Recharts visualisations

---

*Last updated: May 2026*

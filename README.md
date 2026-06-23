# EduPortal Showcase

**Next.js 16 School Management Web Portal**

> Public architectural mirror of the production EduPortal deployed at [mahlontebe.org.za](https://www.mahlontebe.org.za). The private repository contains live environment variables, learner data, and deployment secrets. This showcase demonstrates the architecture, patterns, and engineering decisions without exposing sensitive information.

---

## Author

**Dingaan Mahlatse Machethe**
Head of STEM Department — South African public high school
MSc Data Science (University of East London, UK) | MSc Cybersecurity — Cloud Security Architect (EC-Council University, USA) | PGDip Data Science (Regenesys Business School)

---

## Problem → Technique → Result

### The Problem
Parents, learners, teachers, and administrators at South African public schools have no web portal to access academic performance, attendance, or AI-driven recommendations in real time. Schools cannot afford dedicated development teams or enterprise software licenses. Communication between school and home relies on paper reports sent home with learners — which are frequently lost.

### Techniques Used
- **Full-Stack Architecture:** Next.js 16 App Router with Server Components, TypeScript end-to-end, Prisma ORM with `@prisma/adapter-pg` querying Supabase PostgreSQL
- **Authentication & RBAC:** NextAuth v5 with custom Credentials provider, `bcryptjs` password verification, JWT session strategy, route-level access control via `authorized` callback (Admin/Teacher/Student/Parent)
- **AI Integration:** Vercel AI SDK with Groq `llama-3.3-70b-versatile` — system prompt dynamically injected with live Prisma queries (marks, attendance, APS score, at-risk subjects, career goals). Daily rate limiting tracked in `ChatUsage` table
- **Role-Based AI Personalization:** Student → own marks + attendance + APS; Parent → all linked children's summaries; Teacher → assigned subjects + classes + school-wide stats
- **Serverless Automation:** Vercel Cron with `CRON_SECRET` bearer token — atomically publishes scheduled `News` and `Event` records via `updateMany` where `publishAt <= now()`
- **Database Design:** Prisma schema with NextAuth models + school domain models (Learner, Parent, Teacher, Student, Subject, Mark, Attendance, Prediction, Recommendation, CareerGoal), role-based relations

### The Result
- **Production portal at mahlontebe.org.za** serving 950+ users with role-based dashboards
- **AI chatbot** answers learner-specific questions using real database context — not generic responses, but personalised advice based on actual marks and attendance
- **4-role access system** (Admin/Teacher/Student/Parent) with middleware-enforced route protection — no unauthorised access possible
- **Automated content publishing** — school news and events go live on schedule without manual intervention
- **Integrated ecosystem** — shares learner records with EduAnalytics desktop app via `eaLearnerNumber` bridge key, creating a unified offline + online EdTech platform

---

## What This Is

EduPortal is the cloud-facing web companion to [EduAnalytics](https://github.com/machetheDM/edu-analytics-showcase) (a PySide6 desktop app). While EduAnalytics handles offline data capture, scheduling, and AI diagnostics inside the school, EduPortal extends that data to parents, learners, and administrators via any web browser.

The two systems share the same learner records via the bridge key `eaLearnerNumber` — this is a production-grade integrated EdTech ecosystem, not two isolated projects.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui components |
| Fonts | Inter, Plus Jakarta Sans, JetBrains Mono (Google Fonts) |
| ORM | Prisma 7 + PostgreSQL adapter (`@prisma/adapter-pg`) |
| Database | Supabase PostgreSQL |
| Auth | NextAuth v5 (Auth.js) — Credentials provider with bcrypt |
| AI / LLM | Vercel AI SDK — Groq (`llama-3.3-70b`) + Google Gemini |
| Charts | Recharts |
| Icons | Lucide React |
| Theme | next-themes (dark/light/system) |
| Deployment | Vercel |
| Cron | Vercel Cron + `CRON_SECRET` protected API routes |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel Edge                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Next.js   │  │   Auth.js   │  │  Vercel AI SDK      │  │
│  │   App Router│  │   (NextAuth)│  │  (Groq / Gemini)    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│  ┌──────┴────────────────┴────────────────────┴──────┐      │
│  │              Prisma ORM + PostgreSQL Adapter      │      │
│  └──────────────────────────┬────────────────────────┘      │
│                             │                               │
│                    ┌────────┴────────┐                      │
│                    │  Supabase       │                      │
│                    │  PostgreSQL     │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │  eaLearnerNumber bridge
                              │
                    ┌─────────┴──────────┐
                    │   EduAnalytics     │
                    │   (PySide6 +       │
                    │    SQLite local)   │
                    └────────────────────┘
```

---

## Key Modules Showcase

### 1. Role-Based Authentication & Authorization
`auth.ts`, `auth.config.ts` — NextAuth v5 with a custom Credentials provider and JWT session strategy:
- `bcryptjs` password verification against Prisma `User` records
- Role enum: `ADMIN`, `TEACHER`, `STUDENT`, `PARENT`
- Route-level access control via the `authorized` callback: `/admin` → `ADMIN` only, `/teacher` → `TEACHER` or `ADMIN`, `/student` → `STUDENT` or `ADMIN`, `/parent` → `PARENT` or `ADMIN`
- Unauthenticated users are redirected to `/login`; users visiting the wrong role route are redirected to their correct dashboard
- Session augmentation: `id`, `email`, `name`, `image`, `role` all available server-side and client-side

**Skills demonstrated:** NextAuth v5 configuration, JWT strategy, RBAC middleware patterns, TypeScript module augmentation.

---

### 2. AI Chatbot with Live Context Injection
`app/api/chat/route.ts` — Vercel AI SDK-powered chatbot with role-aware, personalised responses:
- **Groq LLM**: `llama-3.3-70b-versatile` via `@ai-sdk/groq`
- **Dynamic system prompt**: Injects the school's full context (subjects, pass types, APS rules, enrolment process)
- **Live user context injection**: Queries Prisma in real-time to fetch the actual logged-in user's marks, attendance, APS score, at-risk subjects, career goals, and recommendations — then appends this to the system prompt so the AI answers using real data
- **Daily rate limit**: 20 messages per user per day, tracked in `ChatUsage` table
- **Role-specific queries**: Student → own marks + attendance + APS; Parent → all linked children's summaries; Teacher → assigned subjects + classes + school-wide stats

**Skills demonstrated:** LLM integration with Vercel AI SDK, prompt engineering, real-time database context injection, rate limiting, Prisma relational queries, role-based AI personalization.

---

### 3. Prisma ORM + PostgreSQL
`prisma/schema.prisma` — Production-grade schema with:
- NextAuth-compatible models: `User`, `Account`, `Session`, `VerificationToken`
- School domain models: `Learner`, `Parent`, `Teacher`, `Student`, `Subject`, `Mark`, `Attendance`, `Prediction`, `Recommendation`, `CareerGoal`, `News`, `Event`
- Role-based relations: `Teacher` → `SubjectTeacher[]`, `ClassTeacher[]`; `Parent` → `Learner[]`
- Prisma Client generated to `src/generated/prisma` for tree-shaking

`lib/prisma.ts` — Singleton PrismaClient with PostgreSQL adapter, global caching in development, query logging toggle.

**Skills demonstrated:** Prisma schema design, relational modelling, PostgreSQL adapter configuration, singleton pattern for serverless environments.

---

### 4. Scheduled Content Publishing (Vercel Cron)
`app/api/cron/publish/route.ts` — Protected cron endpoint:
- `CRON_SECRET` header validation (401 if missing/invalid)
- Atomically publishes `News` and `Event` records where `publishAt <= now()` and `published = false`
- Returns JSON with counts: `{ newsPublished: N, eventsPublished: M }`

**Skills demonstrated:** Serverless cron jobs, secret-based API protection, atomic batch updates, time-based publishing.

---

### 5. Responsive Marketing Landing Page
`app/page.tsx` — Full-featured public homepage:
- Server-rendered with `dynamic = "force-dynamic"`
- Hero section with stats (enrolled learners, staff, pass rate)
- Feature cards: Performance Tracking, ML Predictions, AI Recommendations, Role-Based Access
- Role portal entry points (Parent / Learner / Teacher / Admin)
- News & events carousel with Unsplash images
- Events carousel with date formatting
- Scroll-reveal animations
- Dark mode compatible via Tailwind + next-themes

**Skills demonstrated:** Next.js App Router server components, responsive design with Tailwind, dark mode theming, component composition, marketing page architecture.

---

### 6. Application Shell & Theming
`app/layout.tsx` — Root layout with:
- Three Google Fonts (Inter, Plus Jakarta Sans, JetBrains Mono) as CSS variables
- `suppressHydrationWarning` for next-themes compatibility
- `ThemeProvider` wrapper for dark/light/system mode
- `NextAuthProvider` for session context
- Global `AnnouncementBanner` (server-fetched)
- Global `ChatbotWidget` (floating AI assistant on every page)

**Skills demonstrated:** Next.js root layout patterns, font optimization, theme management, global context providers, hydration safety.

---

## What This Project Demonstrates

### Full-Stack Web Development
- Next.js 16 App Router with Server Components
- TypeScript end-to-end (API routes, components, database models)
- Prisma ORM with relational database design
- RESTful API design inside Next.js (`app/api/*` route handlers)
- Serverless cron jobs

### AI & LLM Integration
- Vercel AI SDK for streaming/non-streaming text generation
- Dynamic prompt engineering with live database context
- Multi-provider AI architecture (Groq + Google Gemini in the same codebase)
- Rate-limited AI endpoints with usage tracking

### Authentication & Security
- NextAuth v5 with custom credentials provider
- Password hashing with bcryptjs
- JWT session strategy
- Role-based route protection at the middleware/callback level
- Cron endpoint protection with bearer token secrets

### Cloud & DevOps
- Supabase PostgreSQL as managed cloud database
- Vercel serverless deployment
- Environment-variable-only configuration (no secrets in code)
- Prisma generate as post-install hook for CI/CD

---

## Screenshots

See the [`screenshots/`](screenshots/) directory for UI previews of the portal.

---

## Related Projects

- **[EduAnalytics Showcase](https://github.com/machetheDM/edu-analytics-showcase)** — PySide6 desktop app with ML clustering, predictive modelling, FastAPI, and Docker
- **[Production EduPortal](https://www.mahlontebe.org.za)** — Live site (private repository)

---

## License

This showcase is provided for portfolio and educational purposes. The production system and its data remain private.

---

*Built by Dingaan Mahlatse Machethe — transitioning from Education to Tech.*

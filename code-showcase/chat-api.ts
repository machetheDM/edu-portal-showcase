/**
 * EduPortal AI Chat API
 * ======================
 * Vercel AI SDK endpoint with live database context injection.
 * Model: Groq llama-3.3-70b-versatile
 *
 * POST /api/chat
 * Body: { messages: [{ role, content }] }
 * Auth: Required (NextAuth session)
 * Rate limit: 20 messages / user / day
 */
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const DAILY_LIMIT = 20;

const SYSTEM_PROMPT = `You are the official AI assistant for [School Name], located in [District], [Province], South Africa. You are embedded inside EduPortal — the school's management system powered by EduAnalytics AI.

## Your role
Help learners, parents, teachers, and administrators with questions about the school, academic matters, the portal, and general education queries.

## School details (sanitized)
- Grades offered: 8 – 12 (GET Phase: Gr 8–9 | FET Phase: Gr 10–12)
- Subjects include: Sepedi HL, English FAL, Mathematics, Physical Sciences, Life Sciences, etc.

## NSC Pass Types (Grade 12)
- Bachelor Pass: APS ≥ 23, 50% in Home Language + 4 other designated subjects
- Diploma Pass: APS ≥ 19, 40% in Home Language + 3 other subjects
- Higher Certificate: APS ≥ 15, 40% in Home Language

## Tone guidelines
- Be warm and helpful
- Keep answers focused and clear
- Do not invent facts. If unsure, suggest contacting the school office`;

// ── Helper: build personalised context from database ──────────────────────

async function buildUserContext(
  userId: string,
  role: string,
  name: string | null | undefined
): Promise<string> {
  const displayName = name ?? "User";

  // STUDENT: fetch own marks, attendance, APS, goals
  if (role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId },
      include: {
        learner: {
          include: {
            marks: { include: { subject: true }, orderBy: [{ term: "asc" }] },
            attendances: { orderBy: { date: "desc" }, take: 60 },
            recommendations: { where: { isRead: false }, orderBy: { priority: "asc" }, take: 3 },
            careerGoals: { orderBy: { createdAt: "asc" }, take: 1 },
          },
        },
      },
    });

    const learner = student?.learner;
    if (!learner) return `\n\n## Logged-in user\nName: ${displayName} | Role: Learner | Note: No learner profile linked yet.`;

    // Compute subject averages
    const subjectMap = new Map<string, { name: string; code: string; total: number; count: number }>();
    for (const m of learner.marks) {
      const pct = (m.score / m.maxScore) * 100;
      const ex = subjectMap.get(m.subjectId);
      if (ex) { ex.total += pct; ex.count++; }
      else subjectMap.set(m.subjectId, { name: m.subject.name, code: m.subject.code, total: pct, count: 1 });
    }
    const subjectAvgs = Array.from(subjectMap.values())
      .map((s) => ({ ...s, avg: Math.round(s.total / s.count) }))
      .sort((a, b) => b.avg - a.avg);

    // APS calculation (best 6, excluding LO)
    const apsSubjects = subjectAvgs.filter((s) => s.code !== "LO").slice(0, 6);
    const aps = apsSubjects.reduce((sum, s) => sum + apsPoints(s.avg), 0);

    // Attendance
    const total = learner.attendances.length;
    const present = learner.attendances.filter((a) => a.status === "PRESENT").length;
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 100;

    // At-risk detection
    const atRisk = subjectAvgs.filter((s) => s.avg < 40).map((s) => s.name);

    const subjectRows = subjectAvgs
      .map((s) => `  - ${s.name}: ${s.avg}% (${levelLabel(s.avg)}, APS ${apsPoints(s.avg)})`)
      .join("\n");

    const recoLines = learner.recommendations.length
      ? learner.recommendations.map((r) => `  - [${r.priority}] ${r.title}`).join("\n")
      : "  - None";

    const g = learner.careerGoals[0];
    const goal = g ? `${g.programme} at ${g.institution}` : "Not set";

    return `

## You are currently talking to this specific user — use their real data to answer questions:
- **Name**: ${learner.firstName} ${learner.lastName}
- **Role**: Learner (Student)
- **Student Number**: ${learner.studentNumber}
- **Grade**: ${learner.grade}

## Their subject performance:
${subjectRows}

## APS Score: ${aps}/42 → ${getPassType(aps)}
## Attendance: ${attendanceRate}% (${present}/${total} days present)
## At-risk subjects (below 40%): ${atRisk.length ? atRisk.join(", ") : "None — all passing"}

## Unread recommendations:
${recoLines}

## Career goal: ${goal}`;
  }

  // PARENT: fetch linked children's summaries
  if (role === "PARENT") {
    const parent = await prisma.parent.findUnique({
      where: { userId },
      include: {
        learners: {
          include: {
            marks: { include: { subject: true } },
            attendances: { orderBy: { date: "desc" }, take: 30 },
          },
        },
      },
    });

    if (!parent?.learners?.length) {
      return `\n\n## Logged-in user\nName: ${displayName} | Role: Parent | Note: No learner linked yet.`;
    }

    const summaries = parent.learners.map((l) => {
      const subjectMap = new Map<string, { name: string; total: number; count: number }>();
      for (const m of l.marks) {
        const pct = (m.score / m.maxScore) * 100;
        const ex = subjectMap.get(m.subjectId);
        if (ex) { ex.total += pct; ex.count++; }
        else subjectMap.set(m.subjectId, { name: m.subject.name, total: pct, count: 1 });
      }
      const avgs = Array.from(subjectMap.values()).map((s) => ({ name: s.name, avg: Math.round(s.total / s.count) }));
      const total = l.attendances.length;
      const present = l.attendances.filter((a) => a.status === "PRESENT").length;
      const att = total > 0 ? Math.round((present / total) * 100) : 100;
      const rows = avgs.map((s) => `    - ${s.name}: ${s.avg}%`).join("\n");
      return `  **${l.firstName} ${l.lastName}** (Grade ${l.grade}) — Attendance: ${att}%\n${rows}`;
    }).join("\n\n");

    return `\n\n## Logged-in user\nName: ${displayName} | Role: Parent\n\n## Linked learner(s):\n${summaries}`;
  }

  // TEACHER: fetch assigned subjects + school-wide stats
  if (role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      include: {
        subjects: { include: { subject: true } },
        classes:  { include: { class: true } },
      },
    });

    const [totalLearners, atRiskCount, marksCaptured] = await Promise.all([
      prisma.learner.count(),
      prisma.prediction.count({ where: { riskLevel: "HIGH" } }),
      prisma.mark.count({ where: { term: 1, year: 2026 } }),
    ]);

    const subjectList = teacher?.subjects.map((s) => s.subject.name).join(", ") || "Not assigned";
    const classList   = teacher?.classes.map((c) => `${c.class.name} (Grade ${c.class.grade})`).join(", ") || "Not assigned";

    return `\n\n## You are currently talking to this specific user:
- **Name**: ${displayName}
- **Role**: Teacher / Educator
- **Department**: ${teacher?.department ?? "N/A"}

## Their assigned subjects: ${subjectList}
## Their assigned classes: ${classList}

## School overview (Term 1, 2026):
- Total learners enrolled: ${totalLearners}
- Marks captured this term: ${marksCaptured}
- High-risk learners flagged: ${atRiskCount}`;
  }

  return `\n\n## Logged-in user\nName: ${displayName} | Role: ${role}`;
}

// ── CAPS helpers ─────────────────────────────────────────────────────────

function apsPoints(pct: number): number {
  if (pct >= 80) return 7;
  if (pct >= 70) return 6;
  if (pct >= 60) return 5;
  if (pct >= 50) return 4;
  if (pct >= 40) return 3;
  if (pct >= 30) return 2;
  return 1;
}

function getPassType(aps: number): string {
  if (aps >= 23) return "Bachelor Pass potential";
  if (aps >= 19) return "Diploma Pass potential";
  if (aps >= 15) return "Higher Certificate potential";
  return "Below minimum (APS < 15)";
}

function levelLabel(pct: number): string {
  if (pct >= 80) return "L7 Outstanding";
  if (pct >= 70) return "L6 Meritorious";
  if (pct >= 60) return "L5 Substantial";
  if (pct >= 50) return "L4 Adequate";
  if (pct >= 40) return "L3 Moderate";
  if (pct >= 30) return "L2 Elementary";
  return "L1 Not Achieved";
}

// ── Route handler ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized. Please log in to use AI chat." }, { status: 401 });
  }

  const userId = session.user.id;
  const role = (session.user as { role?: string }).role ?? "STUDENT";
  const today = new Date().toISOString().split("T")[0];

  // Rate limit check
  const existing = await prisma.chatUsage.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  const currentCount = existing?.count ?? 0;

  if (currentCount >= DAILY_LIMIT) {
    return Response.json(
      { error: "Daily limit reached", limit: DAILY_LIMIT, count: currentCount },
      { status: 429 }
    );
  }

  const { messages } = await request.json();

  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Build personalised system prompt with live data
  const userContext = await buildUserContext(userId, role, session.user.name);
  const systemWithContext = SYSTEM_PROMPT + userContext;

  try {
    const result = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      system: systemWithContext,
      messages,
    });

    // Track usage
    await prisma.chatUsage.upsert({
      where: { userId_date: { userId, date: today } },
      update: { count: { increment: 1 } },
      create: { userId, date: today, count: 1 },
    });

    return Response.json({
      text: result.text,
      usage: { count: currentCount + 1, limit: DAILY_LIMIT },
    });
  } catch (err) {
    console.error("[/api/chat] generateText failed:", err);
    return Response.json({ error: "AI service unavailable. Please try again." }, { status: 500 });
  }
}

/**
 * Scheduled Content Publishing API
 * ================================
 * Vercel Cron endpoint. Atomically publishes News & Events
 * whose `publishAt` datetime has passed.
 *
 * Protected by CRON_SECRET bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const [newsResult, eventsResult] = await Promise.all([
    prisma.news.updateMany({
      where: { published: false, publishAt: { lte: now } },
      data: { published: true, publishedAt: now },
    }),
    prisma.event.updateMany({
      where: { published: false, publishAt: { lte: now } },
      data: { published: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    newsPublished: newsResult.count,
    eventsPublished: eventsResult.count,
  });
}

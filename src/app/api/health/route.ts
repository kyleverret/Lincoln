import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Health check endpoint — used by ECS/ALB target group health checks
 * and Docker HEALTHCHECK instruction.
 *
 * Returns 200 only when the database is reachable.
 * Does NOT expose version info or internal details.
 */
export async function GET() {
  try {
    // Verify database connectivity with a lightweight query
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json(
      { status: "ok" },
      {
        status: 200,
        headers: {
          // Never cache health checks
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { status: "unhealthy" },
      { status: 503 }
    );
  }
}

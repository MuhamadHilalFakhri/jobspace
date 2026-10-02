import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout */
export const POST = async (): Promise<NextResponse> => {
  try {
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
};

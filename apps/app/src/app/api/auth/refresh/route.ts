import { NextResponse } from "next/server";

import { getUserForAccessToken, refreshSession } from "@/lib/mock-auth-store";

export async function POST(request: Request) {
  const body = await request.json();
  const { refreshToken } = body as { refreshToken?: string };

  if (!refreshToken) {
    return NextResponse.json({ message: "refreshToken is required" }, { status: 400 });
  }

  const session = refreshSession(refreshToken);
  if (!session) {
    return NextResponse.json({ message: "Invalid or expired refresh token" }, { status: 401 });
  }

  const user = getUserForAccessToken(session.accessToken);
  return NextResponse.json({ ...session, user });
}

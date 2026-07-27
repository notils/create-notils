import { NextResponse } from "next/server";

import { bearerTokenFrom, getUserForAccessToken } from "@/lib/mock-auth-store";

export async function GET(request: Request) {
  const token = bearerTokenFrom(request.headers.get("authorization"));
  const user = token ? getUserForAccessToken(token) : null;

  if (!user) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(user);
}

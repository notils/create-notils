import { NextResponse } from "next/server";

import { bearerTokenFrom, revokeAccessToken } from "@/lib/mock-auth-store";

export async function POST(request: Request) {
  const token = bearerTokenFrom(request.headers.get("authorization"));
  if (token) {
    revokeAccessToken(token);
  }
  return new NextResponse(null, { status: 204 });
}

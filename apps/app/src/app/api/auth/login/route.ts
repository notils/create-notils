import { NextResponse } from "next/server";

import { createSessionFor, verifyCredentials } from "@/lib/mock-auth-store";

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
  }

  const user = verifyCredentials(email, password);
  if (!user) {
    return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
  }

  const { accessToken, refreshToken } = createSessionFor(user);
  return NextResponse.json({ accessToken, refreshToken, user });
}

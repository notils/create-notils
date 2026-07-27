import { NextResponse } from "next/server";

import { createSessionFor, registerUser } from "@/lib/mock-auth-store";

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password, name } = body as { email?: string; password?: string; name?: string };

  if (!email || !password || !name) {
    return NextResponse.json(
      { message: "Email, password, and name are required" },
      {
        status: 400,
      }
    );
  }

  const user = registerUser(email, password, name);
  if (!user) {
    return NextResponse.json(
      { message: "An account with that email already exists" },
      {
        status: 409,
      }
    );
  }

  const { accessToken, refreshToken } = createSessionFor(user);
  return NextResponse.json({ accessToken, refreshToken, user });
}

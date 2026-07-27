import { NextResponse } from "next/server";

/**
 * Mock: doesn't actually send an email (there's nothing to send it with in
 * a template). Always reports success regardless of whether the email
 * exists, matching the real security convention of not leaking which
 * emails have accounts.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { email } = body as { email?: string };

  if (!email) {
    return NextResponse.json({ message: "Email is required" }, { status: 400 });
  }

  return new NextResponse(null, { status: 204 });
}

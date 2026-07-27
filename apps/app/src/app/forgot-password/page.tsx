"use client";

import Link from "next/link";

import { ForgotPasswordForm } from "@notils/auth-ui/forgot-password-form";

import { auth } from "@/lib/auth";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <ForgotPasswordForm contract={auth} />
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

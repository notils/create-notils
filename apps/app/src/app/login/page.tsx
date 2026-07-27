"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { SignInForm } from "@notils/auth-ui/sign-in-form";

import { auth, signInInputSchema } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <SignInForm
        contract={auth}
        signInSchema={signInInputSchema}
        onSuccess={() => router.push("/dashboard")}
      />
      <p className="text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="underline underline-offset-4">
          Sign up
        </Link>
        {" · "}
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgot password?
        </Link>
      </p>
    </div>
  );
}

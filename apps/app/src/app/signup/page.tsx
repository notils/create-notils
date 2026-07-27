"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { SignUpForm } from "@notils/auth-ui/sign-up-form";

import { auth, signUpInputSchema } from "@/lib/auth";

export default function SignUpPage() {
  const router = useRouter();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <SignUpForm
        contract={auth}
        signUpSchema={signUpInputSchema}
        onSuccess={() => router.push("/dashboard")}
      />
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}

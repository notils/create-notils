"use client";

import type { AuthContract } from "@notils/auth-custom/contract";
import { ForgotPasswordForm } from "@notils/auth-ui/forgot-password-form";
import { ProtectedRoute } from "@notils/auth-ui/protected-route";
import { SessionStatus } from "@notils/auth-ui/session-status";
import { SignInForm } from "@notils/auth-ui/sign-in-form";
import { SignUpForm } from "@notils/auth-ui/sign-up-form";
import { ThemeToggle } from "@notils/ui/theme/theme-toggle";
import { z } from "zod";

import { ContactForm } from "./contact-form";

type FakeUser = { id: string; email: string };

const signInSchema = z.object({
  email: z.email().min(1, "Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
const signUpSchema = z.object({
  email: z.email().min(1, "Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.enum(["admin", "user"]),
});

const fakeContract: AuthContract<
  FakeUser,
  z.infer<typeof signInSchema>,
  z.infer<typeof signUpSchema>
> = {
  useSession: () => ({ status: "authenticated", user: { id: "1", email: "a@b.com" } }),
  signIn: async () => ({ ok: true }),
  signUp: async () => ({ ok: true }),
  signOut: async () => {},
  requestPasswordReset: async () => ({ ok: true }),
};

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col gap-8 w-full">
          <section>
            <h2 className="mb-2 font-semibold">SessionStatus</h2>
            <SessionStatus contract={fakeContract} renderUser={(u) => <span>{u.email}</span>} />
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Contact us</h2>
            {/* <ContactHeroForm /> */}
            <ContactForm />
          </section>
          <section>
            <h2 className="mb-2 font-semibold">SignInForm</h2>
            <SignInForm contract={fakeContract} signInSchema={signInSchema} />
          </section>
          <section>
            <h2 className="mb-2 font-semibold">SignUpForm</h2>
            <SignUpForm contract={fakeContract} signUpSchema={signUpSchema} />
          </section>
          <section>
            <h2 className="mb-2 font-semibold">ForgotPasswordForm</h2>
            <ForgotPasswordForm contract={fakeContract} />
          </section>
          <section>
            <h2 className="mb-2 font-semibold">ProtectedRoute</h2>
            <ProtectedRoute contract={fakeContract}>
              <p>Protected content visible.</p>
            </ProtectedRoute>
          </section>
        </div>
      </main>
    </div>
  );
}

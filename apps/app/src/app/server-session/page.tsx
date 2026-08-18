import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerSession } from "@notils/auth-better-auth/server";

import { auth } from "@/lib/auth-better-auth-server";

/**
 * A route gated on the SERVER, before anything renders — the capability that
 * distinguishes Better Auth from a client-side contract, and the reason
 * `@notils/auth-better-auth/server` sits deliberately outside `AuthContract`
 * (see docs/auth-providers-design.md).
 *
 * Compare with `/dashboard`, which gates the same session with
 * `ProtectedRoute`: that runs in the browser, so the page ships and then hides
 * itself. This one never reaches an unauthenticated visitor at all — the redirect
 * happens during the request.
 *
 * A custom backend can't generally do this, which is exactly why it lives here
 * rather than in the shared contract every provider must satisfy.
 */
export default async function ServerSessionPage() {
  // Headers are passed in rather than read inside the helper: `next/headers` is
  // Next-specific, and the package stays usable in any runtime Better Auth
  // supports.
  const user = await getServerSession(auth, await headers(), (candidate) => {
    const { email, name } = candidate as { email?: string; name?: string | null };
    return { email: email ?? "", name: name ?? email ?? "" };
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Server-side session</h1>
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium">{user.email}</span>. This page resolved your
        session during the request, so an unauthenticated visitor is redirected before any markup is
        sent — no client-side flash, and nothing to hide after the fact.
      </p>
      <p className="text-muted-foreground text-sm">
        <Link href="/dashboard" className="underline underline-offset-4">
          /dashboard
        </Link>{" "}
        gates the same session in the browser with <code>ProtectedRoute</code>. Both are valid; this
        one is what Better Auth adds.
      </p>
    </div>
  );
}

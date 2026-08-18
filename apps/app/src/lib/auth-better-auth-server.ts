import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

/**
 * The Better Auth server instance — the counterpart to `lib/auth.ts`'s client
 * contract, and the half a custom backend doesn't have (there, the backend IS
 * the server).
 *
 * **The memory adapter is the template's stand-in for your database.** It is the
 * direct equivalent of `lib/mock-auth-store.ts` on the custom-backend side: it
 * makes the demo a real HTTP round-trip through Better Auth's own endpoints
 * without asking you to provision Postgres before `bun run dev` works. State
 * lives in the plain object below, so **it resets on every server restart** —
 * correct for a template, never for production.
 *
 * To point this at a real database, replace `database` with one of Better Auth's
 * adapters and delete the `db` object:
 *
 * ```ts
 * import { drizzleAdapter } from "better-auth/adapters/drizzle";
 * database: drizzleAdapter(yourDrizzleDb, { provider: "pg" }),
 * ```
 *
 * Nothing else in this file — and nothing in the pages — changes when you do.
 */

/**
 * In-memory tables. Better Auth's memory adapter takes a plain
 * `Record<string, unknown[]>` and manages the rows itself; the keys are its core
 * schema, so they are named rather than left to be created implicitly.
 */
const db: Record<string, unknown[]> = {
  user: [],
  session: [],
  account: [],
  verification: [],
};

export const auth = betterAuth({
  database: memoryAdapter(db),

  // Better Auth mounts its own routes under this path (its default), and
  // `app/api/auth/[...all]/route.ts` forwards them. The custom-backend variant of
  // this template hand-writes routes at the same path — the two providers are
  // alternatives, and a scaffold only ever generates one of them, so the paths
  // deliberately match rather than being made artificially distinct.
  basePath: "/api/auth",

  emailAndPassword: {
    enabled: true,
    // 8 characters, matching the Zod schemas the sign-in/sign-up forms validate
    // with (see `lib/auth.ts`). Keeping them in step means a password the form
    // accepts is never rejected by the server for a different reason.
    minPasswordLength: 8,

    /**
     * The template has no email provider, so the reset link is logged instead of
     * sent. This is what makes the forgot-password page demonstrable end to end:
     * the flow really runs, and the URL it would have emailed is in your terminal.
     *
     * Wire your own provider here (Resend, SES, Postmark, …) — the signature is
     * Better Auth's, not ours.
     */
    sendResetPassword: async ({ user, url }) => {
      console.info(`[auth] password reset for ${user.email}: ${url}`);
    },
  },

  /**
   * Signing secret for sessions and tokens.
   *
   * Read from the environment, with a **development-only** fallback so the demo
   * runs immediately after scaffolding. Better Auth would otherwise refuse to
   * start, and a template that fails on first `dev` teaches nothing.
   *
   * Set `BETTER_AUTH_SECRET` before deploying anywhere real — the fallback is a
   * literal in source control, so it is public by definition. `.env.example`
   * lists it.
   */
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-insecure-secret-change-me",

  // Where the app is served, so Better Auth can build absolute callback and
  // reset URLs. Same default as Next's dev server.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
});

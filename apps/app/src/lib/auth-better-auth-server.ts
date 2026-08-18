import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { nextCookies } from "better-auth/next-js";

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
 * In-memory tables, pinned to `globalThis`.
 *
 * Better Auth's memory adapter takes a plain `Record<string, unknown[]>` and
 * manages the rows itself; the keys are its core schema, so they are named rather
 * than created implicitly.
 *
 * **The `globalThis` pin is load-bearing, not defensive boilerplate.** Next
 * bundles route handlers and page renders separately, so a module-level `const`
 * here is instantiated more than once per server — each copy with its own empty
 * tables. Measured: after a sign-up through the route handler, a server component
 * importing this same module saw `user: []`, so `getSession` returned null and the
 * server-gated page redirected an authenticated user back to /login. Pinning the
 * object to `globalThis` gives every module instance the same tables.
 *
 * This is the same reason the Next.js docs pin a Prisma/Drizzle client in
 * development — and it also survives dev-server hot reloads, which would
 * otherwise wipe your session on every file save.
 *
 * A real database adapter needs none of this: the state lives outside the process.
 */
const globalStore = globalThis as typeof globalThis & {
  __notilsAuthDb?: Record<string, unknown[]>;
};

if (!globalStore.__notilsAuthDb) {
  globalStore.__notilsAuthDb = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
}

const db = globalStore.__notilsAuthDb;

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

  /**
   * `nextCookies` is REQUIRED, not optional polish.
   *
   * Better Auth sets the session cookie through Next's own `cookies()` API, and
   * this plugin is what bridges to it. Verified by leaving it out first: sign-up
   * and sign-in returned 200 with a valid token, but no `Set-Cookie` header
   * reached the client — so every subsequent request was anonymous and the
   * server-gated page redirected an authenticated user straight back to /login.
   * A silent, entirely plausible-looking failure.
   *
   * **Keep it LAST in this array.** It reads the response cookies other plugins
   * may have set, and Better Auth warns at runtime if anything follows it.
   */
  plugins: [nextCookies()],
});

/**
 * Server-side helpers — **outside `AuthContract` on purpose.**
 *
 * The spike (see [docs/auth-providers-design.md](../../../docs/auth-providers-design.md))
 * found that `better-auth/api` exposes a substantial server surface —
 * `getSession`, route handlers, middleware — with no counterpart in
 * `AuthContract`, which is a client-side hook contract by construction.
 *
 * Better Auth's main draw is exactly this: checking a session in a server
 * component or route handler *before* rendering. A user who only got the
 * client contract would be stuck with client-side gating and would lose the
 * reason they picked Better Auth.
 *
 * So rather than widen the contract — which would put a `getServerSession?` on
 * every provider, including hand-rolled Rust and Express ones that cannot
 * meaningfully implement it — these live here, reached directly. Same boundary as
 * Tier 2: the contract carries what every provider can do; provider-specific
 * power comes from the provider.
 *
 * These are thin, deliberately. They exist so the *shape* of server-side auth is
 * documented and consistent, not to wrap Better Auth's API. Anything richer:
 * call `auth.api.*` yourself.
 */

/** The subset of a `betterAuth()` instance these helpers need. */
export type BetterAuthInstance = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<{ user?: unknown } | null>;
  };
};

/**
 * Read the session on the server: a server component, route handler, or server
 * action. Returns `null` when there is no session.
 *
 * ```ts
 * // app/dashboard/page.tsx
 * import { headers } from "next/headers";
 *
 * const session = await getServerSession(auth, await headers());
 * if (!session) redirect("/login");
 * ```
 *
 * Headers are passed in rather than read here: `next/headers` is Next-specific,
 * and this package should work in any server runtime Better Auth supports.
 * Importing it would make the package unusable outside Next.
 */
export async function getServerSession<TUser>(
  auth: BetterAuthInstance,
  requestHeaders: Headers,
  mapUser: (user: unknown) => TUser
): Promise<TUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return null;
  }
  return mapUser(session.user);
}

/**
 * Whether a request carries a valid session. For middleware and guards that only
 * need a boolean.
 *
 * A note on Next.js middleware: Better Auth's docs recommend checking the session
 * cookie there rather than calling `getSession`, because middleware runs on every
 * request and a database round-trip per request is expensive. Use this in route
 * handlers and server components; for middleware, prefer a cookie check.
 */
export async function hasServerSession(
  auth: BetterAuthInstance,
  requestHeaders: Headers
): Promise<boolean> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  return Boolean(session?.user);
}

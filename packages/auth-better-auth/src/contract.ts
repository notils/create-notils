import type { BetterAuthContractConfig } from "@notils/auth-better-auth/config";
import type { AuthContract, AuthResult, AuthSession } from "@notils/auth-core/contract";

/**
 * Adapt Better Auth's client to `AuthContract`, so the shared auth UI
 * (`@notils/auth-ui`) renders against Better Auth exactly as it does against a
 * custom backend. That is the whole point: one set of components, any provider.
 *
 * Verified by spike before this was written — Better Auth's client satisfies the
 * contract with no changes to `auth-core`. See
 * [docs/auth-providers-design.md](../../../docs/auth-providers-design.md).
 *
 * **Tier 1 only** (sign-in, sign-up, sign-out, session, password reset). Better
 * Auth's Tier 2 flows — 2FA, passkeys, magic links, organizations — are reached
 * through its own client and plugins, or through
 * [better-auth-ui](https://better-auth-ui.com); they are deliberately not
 * squeezed through this contract, which a hand-rolled backend also has to be able
 * to implement.
 *
 * **Client-side only.** For server components and route handlers, use
 * `@notils/auth-better-auth/server` — Better Auth's real strength, and outside
 * the contract by design.
 */
export function createBetterAuthContract<TUser, TSignIn, TSignUp>(
  config: BetterAuthContractConfig<TUser>
): AuthContract<TUser, TSignIn, TSignUp> {
  const { client, mapUser, resetPasswordRedirectTo } = config;

  return {
    useSession: (): AuthSession<TUser> => {
      const { data, isPending } = client.useSession();

      // `isPending` first: mid-fetch there is no session yet, and reporting
      // "unauthenticated" during load would flash a login screen for an already
      // signed-in user (and, with ProtectedRoute, fire onUnauthenticated).
      if (isPending) {
        return { status: "loading", user: null };
      }
      if (!data?.user) {
        return { status: "unauthenticated", user: null };
      }
      return { status: "authenticated", user: mapUser(data.user) };
    },

    signIn: async (input) => {
      const { email, password } = input as { email: string; password: string };
      const { error } = await client.signIn.email({ email, password });
      return toAuthResult(error);
    },

    signUp: async (input) => {
      const { email, password, name } = input as {
        email: string;
        password: string;
        name: string;
      };
      const { error } = await client.signUp.email({ email, password, name });
      return toAuthResult(error);
    },

    signOut: async () => {
      await client.signOut();
    },

    requestPasswordReset: async (email) => {
      const { error } = await client.requestPasswordReset({
        email,
        ...(resetPasswordRedirectTo ? { redirectTo: resetPasswordRedirectTo } : {}),
      });
      return toAuthResult(error);
    },
  };
}

/**
 * Turn Better Auth's error into an `AuthResult`.
 *
 * Better Auth returns errors rather than throwing, and every one of them is a
 * runtime condition the UI must render — a wrong password, an email already in
 * use, a rate limit. So they all become `{ ok: false }`.
 *
 * Note this differs from `@notils/auth-custom`, which distinguishes a `ZodError`
 * (the backend's response didn't match its declared schema — a bug, thrown) from
 * an `HttpError` (a runtime failure — returned). That split exists there because
 * the response shape is *asserted* by the caller and can be wrong. Here Better
 * Auth owns both ends, so there is no schema to mismatch and nothing to throw.
 */
function toAuthResult(error: { message?: string } | null | undefined): AuthResult {
  if (!error) {
    return { ok: true };
  }
  return { ok: false, error: error.message ?? "Authentication failed" };
}

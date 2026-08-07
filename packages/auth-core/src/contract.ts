/**
 * The Tier 1 auth contract — the seam between UI and provider.
 * Design: [docs/auth-providers-design.md](../../../docs/auth-providers-design.md).
 *
 * Only the flows every realistic provider implements: sign-in, sign-up,
 * sign-out, session read, password reset. Nothing here mentions HTTP,
 * endpoints, or any specific library, so a provider can be a REST client, an
 * in-process library like Better Auth, or a hand-rolled adapter for someone's
 * Rust server. UI components are written against this shape ONLY, which is why
 * the same `<SignInForm/>` works regardless of what's behind it.
 *
 * **This package is types only, on purpose.** It has no runtime dependencies and
 * every provider depends on it rather than on each other — so installing
 * `auth-ui` plus one provider never drags in a second provider's transport code.
 *
 * Tier 2 flows (2FA, passkey, SSO, magic link, organizations) are
 * provider-specific by nature and deliberately absent: a custom backend often
 * doesn't implement them, and including them would make this contract
 * unimplementable for the very users it exists to serve. Reach for the
 * provider's own library (e.g. better-auth-ui) for those.
 *
 * TUser, TSignIn, TSignUp are inferred from whatever schemas the caller
 * supplies — there is no hand-declared "AuthUser" shape to drift out of sync
 * with what a backend actually returns.
 */

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthResult = { ok: true } | { ok: false; error: string };

export type AuthSession<TUser> = {
  status: AuthStatus;
  user: TUser | null;
};

/**
 * What Tier 1 UI components (SignInForm, SignUpForm, ...) call. Each
 * provider supplies its own implementation of this contract — the
 * custom-backend provider wraps @notils/api-client + the caller's Zod
 * schemas; a future Better Auth provider wraps createAuthClient().
 */
export type AuthContract<TUser, TSignIn, TSignUp> = {
  useSession: () => AuthSession<TUser>;
  signIn: (input: TSignIn) => Promise<AuthResult>;
  signUp: (input: TSignUp) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
};

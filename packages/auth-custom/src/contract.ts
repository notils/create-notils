/**
 * Tier 1 auth contract (see docs/packages-and-providers-architecture.md).
 * Only the flows every realistic provider implements: sign-in, sign-up,
 * sign-out, session read, password reset. UI components are written against
 * this shape only — never against a specific provider — so the same
 * components render regardless of which provider's implementation is in
 * scope.
 *
 * Tier 2 flows (2FA, passkey, SSO, magic link, ...) are provider-specific by
 * design and do not belong here — see the Better Auth provider (not yet
 * built) for those.
 *
 * TUser, TSignIn, TSignUp are inferred from the Zod schemas passed into
 * CustomBackendAuthConfig — there is no hand-declared "AuthUser" shape to
 * drift out of sync with what the backend actually returns. If the backend's
 * response shape changes, the schema fails to parse and the mismatch surfaces
 * immediately as a thrown ZodError, not a silently wrong object.
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

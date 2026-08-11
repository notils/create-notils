/**
 * Configuration for the Better Auth provider.
 *
 * Deliberately thin. Unlike `@notils/auth-custom` — which must be told every
 * endpoint path and response schema, because it talks to a backend it knows
 * nothing about — Better Auth owns both ends of the wire. It already knows its
 * own routes and shapes, so re-describing them here would be duplication that
 * can only drift.
 *
 * What this provider adds is the *contract adapter*: a translation from Better
 * Auth's client into `AuthContract`, so the shared auth UI works unchanged. See
 * [docs/auth-providers-design.md](../../../docs/auth-providers-design.md).
 */

/** The subset of Better Auth's React client this provider uses. */
export type BetterAuthClient = {
  useSession: () => {
    data: { user?: unknown } | null | undefined;
    isPending: boolean;
    error?: { message?: string } | null;
  };
  signIn: {
    email: (input: {
      email: string;
      password: string;
      callbackURL?: string;
    }) => Promise<{ error?: { message?: string } | null }>;
  };
  signUp: {
    email: (input: {
      email: string;
      password: string;
      name: string;
      callbackURL?: string;
    }) => Promise<{ error?: { message?: string } | null }>;
  };
  signOut: () => Promise<unknown>;
  requestPasswordReset: (input: {
    email: string;
    redirectTo?: string;
  }) => Promise<{ error?: { message?: string } | null }>;
};

export type BetterAuthContractConfig<TUser> = {
  /**
   * The client from `createAuthClient()` (`better-auth/react`).
   *
   * Injected rather than constructed here: the client is where a project wires
   * its own plugins (two-factor, organization, passkey, …), and constructing it
   * internally would either drop those or force us to proxy every plugin option.
   * The project owns its client; this provider adapts it.
   */
  client: BetterAuthClient;
  /**
   * Map Better Auth's session user onto the shape your app codes against.
   *
   * Better Auth's user carries more fields than most apps want, and a project
   * with plugins or `additionalFields` has a wider shape still. Rather than
   * guess, the caller narrows — which is also what makes `TUser` infer at the
   * call site with no hand-written annotation.
   */
  mapUser: (user: unknown) => TUser;
  /** Where the reset-password email should land. Passed through to Better Auth. */
  resetPasswordRedirectTo?: string;
};

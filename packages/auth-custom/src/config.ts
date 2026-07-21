import type { z } from "zod";

/**
 * A response schema for an endpoint that issues/refreshes a session: must
 * parse to { accessToken, refreshToken?, user }. The user's own shape is
 * whatever `user` resolves to in the schema — nothing here assumes field
 * names beyond this top-level envelope, which itself must match your
 * backend's actual response (wrap/rename fields in the schema definition if
 * your backend nests or renames them).
 */
type TokenResponseSchema<TUser> = z.ZodType<{
  accessToken: string;
  refreshToken?: string | undefined;
  user: TUser;
}>;

/**
 * Every path and response schema is supplied by the caller — no assumed
 * defaults, no runtime field-name guessing. Define each schema against your
 * own backend's actual response shape; a mismatch throws a ZodError
 * immediately (at the call site, with the exact field and reason) instead of
 * silently producing a wrong object.
 */
export type CustomBackendAuthConfig<TUser, TSignIn, TSignUp> = {
  /** e.g. "/auth/login". Receives the signIn() input as JSON. */
  loginPath: string;
  /** e.g. "/auth/register". Receives the signUp() input as JSON. */
  registerPath: string;
  /** e.g. "/auth/refresh". Receives { refreshToken } as JSON. */
  refreshPath: string;
  /** e.g. "/auth/logout". Called with no body; failures are ignored. */
  logoutPath?: string;
  /** e.g. "/auth/reset-password". Receives { email } as JSON. */
  resetPasswordPath?: string;
  /** e.g. "/auth/session" or "/auth/me". Returns the current user, or 401. */
  sessionPath: string;

  /** Validates the login endpoint's JSON response. */
  loginResponseSchema: TokenResponseSchema<TUser>;
  /** Validates the register endpoint's JSON response. */
  registerResponseSchema: TokenResponseSchema<TUser>;
  /** Validates the refresh endpoint's JSON response. */
  refreshResponseSchema: TokenResponseSchema<TUser>;
  /** Validates the session endpoint's JSON response — the user object directly, no envelope. */
  sessionResponseSchema: z.ZodType<TUser>;

  /** Validates the signIn() call's own input before it's sent. */
  signInInputSchema: z.ZodType<TSignIn>;
  /** Validates the signUp() call's own input before it's sent. */
  signUpInputSchema: z.ZodType<TSignUp>;

  /**
   * Token persistence. Required — there is no safe default storage (a web
   * app might use localStorage/cookies; React Native must use SecureStore).
   * Supply an implementation appropriate to the target platform.
   */
  storage: {
    getAccessToken: () => Promise<string | null>;
    getRefreshToken: () => Promise<string | null>;
    setTokens: (tokens: { accessToken: string; refreshToken: string | null }) => Promise<void>;
    clearTokens: () => Promise<void>;
  };
};

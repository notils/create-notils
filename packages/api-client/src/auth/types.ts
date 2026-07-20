/**
 * The seam that keeps the http client auth-agnostic. It never owns auth — it
 * asks an AuthProvider for a token, and on a 401 asks it to refresh. Each
 * platform/provider supplies its own AuthProvider (token storage on React
 * Native, a cookie-session pass-through on web with Better Auth, etc.) — the
 * transport core here never changes.
 */
export type AuthProvider = {
  /**
   * Return the current access token, or null if unauthenticated.
   * Called before every request to set the Authorization header.
   */
  getAccessToken: () => Promise<string | null>;

  /**
   * Obtain a fresh access token after a 401. Return the new token, or null if
   * refresh failed / there is no session (the client then surfaces the 401).
   * The client guarantees this is called at most once for a burst of concurrent
   * 401s (single-flight), so implementations don't need their own locking.
   */
  refresh: () => Promise<string | null>;

  /**
   * Called when refresh fails (session is unrecoverable). Use it to clear tokens
   * and route to login. Optional.
   */
  onAuthError?: () => void | Promise<void>;
};

/** An AuthProvider that performs no auth — every request is anonymous. */
export const anonymousAuthProvider: AuthProvider = {
  getAccessToken: async () => null,
  refresh: async () => null,
};

import type { AuthProvider } from "@notils/api-client/auth/types";
import type { HttpClient } from "@notils/api-client/http";
import type { CustomBackendAuthConfig } from "@notils/auth-custom/config";

/**
 * Builds the AuthProvider that @notils/api-client's createHttpClient consumes:
 * reads the stored access token per request, and on a 401 calls the configured
 * refresh endpoint (api-client guarantees this happens at most once per burst
 * of concurrent 401s — no locking needed here). The response is validated
 * against `refreshResponseSchema`; a mismatch throws (a bug to fix), a
 * network/API failure is caught and treated as "refresh failed."
 *
 * `http` must be a client with no auth attached (createHttpClient({ baseUrl }))
 * — this provider calls the refresh endpoint directly, unauthenticated, to
 * avoid a circular dependency on itself.
 */
export function createCustomBackendAuthProvider<TUser, TSignIn, TSignUp>(
  config: CustomBackendAuthConfig<TUser, TSignIn, TSignUp>,
  http: HttpClient
): AuthProvider {
  return {
    getAccessToken: () => config.storage.getAccessToken(),

    async refresh() {
      const refreshToken = await config.storage.getRefreshToken();
      if (!refreshToken) {
        return null;
      }

      let raw: unknown;
      try {
        raw = await http.post<unknown>(config.refreshPath, { refreshToken });
      } catch {
        return null;
      }

      const parsed = config.refreshResponseSchema.parse(raw);
      await config.storage.setTokens({
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken ?? refreshToken,
      });
      return parsed.accessToken;
    },

    async onAuthError() {
      await config.storage.clearTokens();
    },
  };
}

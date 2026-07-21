import { useEffect, useState } from "react";

import type { HttpClient } from "@notils/api-client/http";
import { HttpError } from "@notils/api-client/http";
import type { CustomBackendAuthConfig } from "@notils/auth-custom/config";
import type { AuthContract, AuthResult, AuthSession } from "@notils/auth-custom/contract";

/**
 * Implements AuthContract against a user-supplied backend, using the config's
 * Zod schemas to validate every response.
 *
 * Two distinct failure classes are handled differently, deliberately:
 * - A ZodError (the response didn't match the schema you defined) is a bug
 *   to fix, not a runtime condition to swallow — it's rethrown so it fails
 *   loudly at the call site with the exact mismatched field.
 * - An HttpError (network/API failure, e.g. wrong password → 401) is an
 *   expected runtime outcome — it's caught and turned into AuthResult, per
 *   the contract's own return type.
 *
 * `authedHttp` must be the client wired with createCustomBackendAuthProvider
 * (so requests carry the Authorization header and auto-refresh on 401);
 * `anonymousHttp` must be a plain client with no auth attached, used for
 * login/register/reset, which happen before a session exists.
 *
 * Only `useSession` is an actual React hook (it holds state); the rest are
 * plain async functions closed over config/http, safe to call from anywhere.
 */
export function createAuthContract<TUser, TSignIn, TSignUp>(
  config: CustomBackendAuthConfig<TUser, TSignIn, TSignUp>,
  anonymousHttp: HttpClient,
  authedHttp: HttpClient
): AuthContract<TUser, TSignIn, TSignUp> {
  function useSession(): AuthSession<TUser> {
    const [session, setSession] = useState<AuthSession<TUser>>({
      status: "loading",
      user: null,
    });

    useEffect(() => {
      let cancelled = false;
      config.storage.getAccessToken().then(async (token) => {
        if (!token) {
          if (!cancelled) {
            setSession({ status: "unauthenticated", user: null });
          }
          return;
        }
        try {
          const raw = await authedHttp.get<unknown>(config.sessionPath);
          const user = config.sessionResponseSchema.parse(raw);
          if (!cancelled) {
            setSession({ status: "authenticated", user });
          }
        } catch {
          if (!cancelled) {
            setSession({ status: "unauthenticated", user: null });
          }
        }
      });
      return () => {
        cancelled = true;
      };
    }, []);

    return session;
  }

  async function signIn(input: TSignIn): Promise<AuthResult> {
    const validInput = config.signInInputSchema.parse(input);
    try {
      const raw = await anonymousHttp.post<unknown>(config.loginPath, validInput);
      const { accessToken, refreshToken } = config.loginResponseSchema.parse(raw);
      await config.storage.setTokens({ accessToken, refreshToken: refreshToken ?? null });
      return { ok: true };
    } catch (err) {
      if (err instanceof HttpError) {
        return { ok: false, error: err.message };
      }
      throw err;
    }
  }

  async function signUp(input: TSignUp): Promise<AuthResult> {
    const validInput = config.signUpInputSchema.parse(input);
    try {
      const raw = await anonymousHttp.post<unknown>(config.registerPath, validInput);
      const { accessToken, refreshToken } = config.registerResponseSchema.parse(raw);
      await config.storage.setTokens({ accessToken, refreshToken: refreshToken ?? null });
      return { ok: true };
    } catch (err) {
      if (err instanceof HttpError) {
        return { ok: false, error: err.message };
      }
      throw err;
    }
  }

  async function signOut(): Promise<void> {
    if (config.logoutPath) {
      try {
        await authedHttp.post(config.logoutPath);
      } catch {
        // best-effort — always clear local tokens regardless of server response
      }
    }
    await config.storage.clearTokens();
  }

  async function requestPasswordReset(email: string): Promise<AuthResult> {
    if (!config.resetPasswordPath) {
      return { ok: false, error: "Password reset is not configured for this backend" };
    }
    try {
      await anonymousHttp.post(config.resetPasswordPath, { email });
      return { ok: true };
    } catch (err) {
      if (err instanceof HttpError) {
        return { ok: false, error: err.message };
      }
      throw err;
    }
  }

  return { useSession, signIn, signUp, signOut, requestPasswordReset };
}

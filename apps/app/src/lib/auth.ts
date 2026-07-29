"use client";

import { z } from "zod";

import { createHttpClient } from "@notils/api-client/http";
import type { CustomBackendAuthConfig } from "@notils/auth-custom/config";
import { createCustomBackendAuthProvider } from "@notils/auth-custom/provider";
import { createAuthContract } from "@notils/auth-custom/use-auth";

/**
 * Real end-to-end wiring of @notils/auth-custom against this project's own
 * app/api/auth/* routes (a mock, in-memory backend — see
 * lib/mock-auth-store.ts). Swap `loginPath`/etc. and the schemas below for
 * your actual backend's shapes; nothing else in this file is
 * project-specific.
 */

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});
export type User = z.infer<typeof userSchema>;

const tokenEnvelopeSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  user: userSchema,
});

export const signInInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signUpInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

// localStorage is fine for a browser-only template; a project with SSR-gated
// routes or React Native would swap this for cookies / SecureStore instead —
// this is exactly the seam CustomBackendAuthConfig.storage exists for.
const ACCESS_TOKEN_KEY = "notils.auth.accessToken";
const REFRESH_TOKEN_KEY = "notils.auth.refreshToken";

const authConfig: CustomBackendAuthConfig<
  User,
  z.infer<typeof signInInputSchema>,
  z.infer<typeof signUpInputSchema>
> = {
  loginPath: "/api/auth/login",
  registerPath: "/api/auth/register",
  refreshPath: "/api/auth/refresh",
  logoutPath: "/api/auth/logout",
  resetPasswordPath: "/api/auth/reset-password",
  sessionPath: "/api/auth/session",
  loginResponseSchema: tokenEnvelopeSchema,
  registerResponseSchema: tokenEnvelopeSchema,
  refreshResponseSchema: tokenEnvelopeSchema,
  sessionResponseSchema: userSchema,
  signInInputSchema,
  signUpInputSchema,
  storage: {
    getAccessToken: async () =>
      typeof window === "undefined" ? null : localStorage.getItem(ACCESS_TOKEN_KEY),
    getRefreshToken: async () =>
      typeof window === "undefined" ? null : localStorage.getItem(REFRESH_TOKEN_KEY),
    setTokens: async ({ accessToken, refreshToken }) => {
      if (typeof window === "undefined") return;
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      }
    },
    clearTokens: async () => {
      if (typeof window === "undefined") return;
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    },
  },
};

// createHttpClient builds requests via `new URL(path, baseUrl)`, which
// requires an absolute base — a same-origin relative baseUrl like "" would
// throw. Next.js API routes are same-origin, so the browser's own origin is
// the correct base; this file is "use client" already, so window always
// exists where this module actually runs.
const baseUrl = typeof window === "undefined" ? "" : window.location.origin;

const anonymousHttp = createHttpClient({ baseUrl, apiPrefix: "" });
const authProvider = createCustomBackendAuthProvider(authConfig, anonymousHttp);
const authedHttp = createHttpClient({ baseUrl, apiPrefix: "", auth: authProvider });

export const auth = createAuthContract(authConfig, anonymousHttp, authedHttp);

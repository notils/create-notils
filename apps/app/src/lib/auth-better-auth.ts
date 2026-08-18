"use client";

import { createAuthClient } from "better-auth/react";
import { z } from "zod";

import { createBetterAuthContract } from "@notils/auth-better-auth/contract";

/**
 * Real end-to-end wiring of `@notils/auth-better-auth` against this project's own
 * Better Auth server (see `lib/auth-better-auth-server.ts`, mounted at
 * `app/api/auth/[...all]/route.ts`).
 *
 * **This file is the provider seam, and it is the only one.** It exports exactly
 * the same three things the custom-backend variant does — `auth`,
 * `signInInputSchema`, `signUpInputSchema` — so every page and component
 * (`login`, `signup`, `forgot-password`, `dashboard`, `nav-bar`) imports from
 * `@/lib/auth` and works unchanged against either provider. That is the whole
 * point of `@notils/auth-core`: swapping providers is swapping this file.
 *
 * Notice how much smaller it is than the custom-backend version. That file must
 * declare every endpoint path and response schema, because it talks to a backend
 * it knows nothing about. Better Auth owns both ends of the wire, so there is
 * nothing to describe — only the client to construct and the user shape to narrow.
 */

/**
 * The app's user shape.
 *
 * Better Auth's session user carries more fields than most apps want, so this
 * narrows it — the same three fields the custom-backend variant exposes, which is
 * what lets shared components render either provider's user.
 */
export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});
export type User = z.infer<typeof userSchema>;

/**
 * Form input schemas. These stay identical to the custom-backend variant's on
 * purpose: they drive `SignInForm`/`SignUpForm`, and the forms must not change
 * shape when the provider does.
 *
 * The 8-character minimum matches `minPasswordLength` on the server, so the form
 * and Better Auth agree on what a valid password is.
 */
export const signInInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signUpInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

/**
 * Better Auth's React client.
 *
 * Constructed HERE rather than inside `@notils/auth-better-auth` deliberately:
 * this is where a project adds its own plugins (two-factor, passkey,
 * organization, …). The provider adapts whatever client you give it, so adding a
 * plugin never means editing the package.
 *
 * No `baseURL`: the client defaults to the current origin, and the server is
 * mounted in this same Next app.
 */
const client = createAuthClient();

/**
 * The contract the shared auth UI renders against.
 *
 * `mapUser` narrows Better Auth's user to `User`. It is written defensively —
 * reading through an `unknown` — because the provider deliberately does not
 * assume Better Auth's user type, which widens with plugins and
 * `additionalFields`.
 */
export const auth = createBetterAuthContract<
  User,
  z.infer<typeof signInInputSchema>,
  z.infer<typeof signUpInputSchema>
>({
  client,
  mapUser: (user) => {
    const { id, email, name } = user as { id?: string; email?: string; name?: string | null };
    return {
      id: id ?? "",
      email: email ?? "",
      // Better Auth allows a null name; the app's shape wants a string, and an
      // email is a better fallback label than an empty one.
      name: name ?? email ?? "",
    };
  },
  // Where Better Auth's reset email should send the user. The template has no
  // email provider, so the link is logged to the server console instead — see
  // `sendResetPassword` in lib/auth-better-auth-server.ts.
  resetPasswordRedirectTo: "/login",
});

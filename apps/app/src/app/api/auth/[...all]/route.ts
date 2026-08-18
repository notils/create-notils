import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth-better-auth-server";

/**
 * Mounts Better Auth's own endpoints — sign-in, sign-up, sign-out, session,
 * password reset — under `/api/auth/*`.
 *
 * This one catch-all replaces the six hand-written route files the
 * custom-backend variant needs, because Better Auth brings its own routes; there
 * is nothing to implement, only to forward. `toNextJsHandler` returns all five
 * HTTP method handlers, re-exported below.
 *
 * A scaffold generates EITHER this file or the hand-written `api/auth/*` routes,
 * never both — they claim the same path. Which one you get follows the `--auth`
 * choice (see `@notils/transform/app-content`).
 */
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(auth);

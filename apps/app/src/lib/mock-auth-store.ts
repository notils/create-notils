import { randomUUID } from "node:crypto";

/**
 * In-memory mock auth backend, backing the app/api/auth/* routes. This is a
 * STAND-IN for a real backend — @notils/auth-custom is built to talk to
 * whatever auth service a project actually has; this exists only so the
 * scaffolded template demonstrates a real HTTP round-trip (through
 * @notils/api-client + @notils/auth-custom) rather than a fake in-JS
 * AuthContract.
 *
 * A real project deletes this file and app/api/auth/*, and points
 * CustomBackendAuthConfig's paths at its actual backend instead.
 *
 * State resets on every server restart/redeploy (it's a plain in-memory Map,
 * not a database) — expected and fine for a template stand-in, never do this
 * in production.
 */

export type MockUser = {
  id: string;
  email: string;
  name: string;
};

type StoredUser = MockUser & { password: string };

const usersByEmail = new Map<string, StoredUser>();
const sessionsByAccessToken = new Map<string, { userId: string; refreshToken: string }>();
const refreshTokens = new Map<string, string>(); // refreshToken -> accessToken

function issueSession(userId: string) {
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  sessionsByAccessToken.set(accessToken, { userId, refreshToken });
  refreshTokens.set(refreshToken, accessToken);
  return { accessToken, refreshToken };
}

export function registerUser(email: string, password: string, name: string): MockUser | null {
  if (usersByEmail.has(email)) {
    return null;
  }
  const user: StoredUser = { id: randomUUID(), email, name, password };
  usersByEmail.set(email, user);
  return { id: user.id, email: user.email, name: user.name };
}

export function verifyCredentials(email: string, password: string): MockUser | null {
  const user = usersByEmail.get(email);
  if (!user || user.password !== password) {
    return null;
  }
  return { id: user.id, email: user.email, name: user.name };
}

export function createSessionFor(user: MockUser) {
  return issueSession(user.id);
}

export function refreshSession(refreshToken: string) {
  const accessToken = refreshTokens.get(refreshToken);
  if (!accessToken) {
    return null;
  }
  const session = sessionsByAccessToken.get(accessToken);
  if (!session) {
    return null;
  }
  // Rotate both tokens on refresh — a stolen refresh token only works once.
  sessionsByAccessToken.delete(accessToken);
  refreshTokens.delete(refreshToken);
  return issueSession(session.userId);
}

export function getUserForAccessToken(accessToken: string): MockUser | null {
  const session = sessionsByAccessToken.get(accessToken);
  if (!session) {
    return null;
  }
  const user = [...usersByEmail.values()].find((u) => u.id === session.userId);
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

export function revokeAccessToken(accessToken: string) {
  const session = sessionsByAccessToken.get(accessToken);
  if (session) {
    refreshTokens.delete(session.refreshToken);
  }
  sessionsByAccessToken.delete(accessToken);
}

export function bearerTokenFrom(authorizationHeader: string | null): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authorizationHeader.slice("Bearer ".length);
}

import type { ReactNode } from "react";

import type { AuthContract } from "@notils/auth-custom/contract";
import { Button } from "@notils/ui/components/ui/button";

/**
 * Renders based on session status: nothing meaningful while loading, a sign-out
 * affordance when authenticated, `fallback` (typically a sign-in link) when not.
 * `renderUser` lets the caller show whatever they want from TUser — this
 * component has no opinion on the user object's shape beyond what
 * AuthContract already guarantees (nullable, not further specified).
 */
export function SessionStatus<TUser, TSignIn, TSignUp>({
  contract,
  renderUser,
  fallback,
}: {
  contract: AuthContract<TUser, TSignIn, TSignUp>;
  renderUser: (user: TUser) => ReactNode;
  fallback?: ReactNode;
}) {
  const session = contract.useSession();

  if (session.status === "loading") {
    return null;
  }

  if (session.status === "unauthenticated" || !session.user) {
    return fallback ?? null;
  }

  return (
    <div className="flex items-center gap-3">
      {renderUser(session.user)}
      <Button variant="ghost" size="sm" onClick={() => contract.signOut()}>
        Sign out
      </Button>
    </div>
  );
}

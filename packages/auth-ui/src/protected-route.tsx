import { type ReactNode, useEffect } from "react";

import type { AuthContract } from "@notils/auth-custom/contract";

/**
 * Gates `children` on session status. Framework-agnostic on purpose — it
 * does not redirect itself (that's Next.js's `next/navigation`, not
 * something this package should assume). Wire redirects in `onUnauthenticated`:
 *
 *   const router = useRouter();
 *   <ProtectedRoute contract={auth} onUnauthenticated={() => router.replace("/login")}>
 */
export function ProtectedRoute<TUser, TSignIn, TSignUp>({
  contract,
  onUnauthenticated,
  loadingFallback = null,
  children,
}: {
  contract: AuthContract<TUser, TSignIn, TSignUp>;
  onUnauthenticated?: () => void;
  loadingFallback?: ReactNode;
  children: ReactNode;
}) {
  const session = contract.useSession();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      onUnauthenticated?.();
    }
  }, [session.status, onUnauthenticated]);

  if (session.status !== "authenticated") {
    return loadingFallback;
  }

  return children;
}

"use client";

import { useRouter } from "next/navigation";

import { ProtectedRoute } from "@notils/auth-ui/protected-route";
import { SessionStatus } from "@notils/auth-ui/session-status";

import { auth } from "@/lib/auth";

export default function DashboardPage() {
  const router = useRouter();

  return (
    <ProtectedRoute
      contract={auth}
      onUnauthenticated={() => router.replace("/login")}
      loadingFallback={<div className="p-16 text-sm text-muted-foreground">Loading…</div>}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <SessionStatus contract={auth} renderUser={(user) => <span>{user.email}</span>} />
        </div>
        <p className="text-muted-foreground">
          This route is gated by ProtectedRoute — reaching it means the session is real, confirmed
          against the /api/auth/session route via @notils/auth-custom.
        </p>
      </div>
    </ProtectedRoute>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { SessionStatus } from "@notils/auth-ui/session-status";
import { Button } from "@notils/ui/components/ui/button";
import { ThemeToggle } from "@notils/ui/theme/theme-toggle";

import { auth } from "@/lib/auth";

export function NavBar() {
  const router = useRouter();

  return (
    <header className="flex w-full items-center justify-between border-b px-6 py-4">
      <Link href="/" className="font-semibold">
        create-notils
      </Link>
      <div className="flex items-center gap-4">
        <SessionStatus
          contract={auth}
          renderUser={(user) => <span className="text-sm">{user.email}</span>}
          fallback={
            <>
              <Button variant="ghost" size="sm" onClick={() => router.push("/login")}>
                Sign in
              </Button>
              <Button size="sm" onClick={() => router.push("/signup")}>
                Sign up
              </Button>
            </>
          }
        />
        <ThemeToggle />
      </div>
    </header>
  );
}

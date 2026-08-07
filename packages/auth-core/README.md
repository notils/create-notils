# @notils/auth-core

The auth contract every provider implements and every auth component is written
against. **Types only — no runtime code, no dependencies.**

Design and rationale:
[docs/auth-providers-design.md](../../docs/auth-providers-design.md).

## What's inside

```
src/
├── contract.ts  # AuthContract, AuthSession, AuthResult, AuthStatus
└── index.ts     # public exports
```

## Why it exists

`AuthContract` used to live in `@notils/auth-custom`, which meant `@notils/auth-ui`
depended on the **custom-backend provider** just to import a type. Someone using
Better Auth would install a package for talking to a REST API they don't have.

Moving the contract here makes the graph honest:

```
                 auth-core  (types only)
                 ↑    ↑    ↑
          auth-ui  auth-custom  auth-better-auth
```

Providers never depend on each other. Install `auth-ui` plus exactly **one**
provider — that is what lets the same `<SignInForm/>` work whether the app talks
to a Rust server, an Express API, or Better Auth running in-process.

## The contract

```ts
type AuthContract<TUser, TSignIn, TSignUp> = {
  useSession: () => AuthSession<TUser>;
  signIn: (input: TSignIn) => Promise<AuthResult>;
  signUp: (input: TSignUp) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
};
```

Nothing here mentions HTTP, endpoints, or any library. `TUser`/`TSignIn`/`TSignUp`
are inferred from whatever schemas the caller supplies, so there is no
hand-declared user shape to drift out of sync with a real backend.

## What is deliberately NOT here

**Tier 2 flows** — 2FA, passkeys, magic links, SSO, organizations, device
sessions. They are provider-specific by nature: a custom REST backend often
doesn't implement them at all, and when it does, not the same way as Better Auth.
Adding them here would make this contract unimplementable for the users
`auth-custom` exists to serve.

Reach for the provider's own library for those — e.g.
[better-auth-ui](https://better-auth-ui.com) alongside our components.

## Writing a provider

Anything that satisfies the contract works:

```ts
import type { AuthContract } from "@notils/auth-core/contract";

export function createMyAuthContract(): AuthContract<User, SignIn, SignUp> {
  return {
    useSession: () => {
      /* your session hook, mapped to { status, user } */
    },
    signIn: async (input) => {
      /* return { ok: true } or { ok: false, error } */
    },
    // ...
  };
}
```

Two conventions worth keeping, both from `auth-custom`:

- **A schema mismatch should throw, not return `{ ok: false }`.** A response that
  doesn't match its schema is a bug to fix, not a runtime condition to swallow.
- **A credential or network failure returns `AuthResult`.** That is a real state
  the UI must render.

Collapsing those two makes a schema bug look like a wrong password.

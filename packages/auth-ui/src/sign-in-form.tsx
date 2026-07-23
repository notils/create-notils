import { useState } from "react";

import type { AuthContract } from "@notils/auth-custom/contract";
import { SchemaForm } from "@notils/form-builder/schema-form";
import { Alert, AlertDescription } from "@notils/ui/components/ui/alert";
import type { z } from "zod";

/**
 * Tier 1 component: driven only by AuthContract, never a specific provider.
 * The same component renders identically whether `contract` comes from
 * @notils/auth-custom or (once built) a Better Auth provider — only the
 * contract implementation differs, not this file.
 *
 * `signInSchema` is required as a separate prop (not derived from
 * `contract`) because AuthContract only describes behavior, not the input
 * shape — the caller already has this schema in hand from wiring up their
 * provider's config (e.g. CustomBackendAuthConfig.signInInputSchema).
 */
export function SignInForm<TUser, TSignIn, TSignUp>({
  contract,
  signInSchema,
  onSuccess,
}: {
  contract: AuthContract<TUser, TSignIn, TSignUp>;
  signInSchema: z.ZodType<TSignIn>;
  onSuccess?: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <SchemaForm
        schema={signInSchema}
        submitLabel="Sign in"
        onSubmit={async (values) => {
          setFormError(null);
          const result = await contract.signIn(values);
          if (result.ok) {
            onSuccess?.();
          } else {
            setFormError(result.error);
          }
        }}
      />
    </div>
  );
}

import { useState } from "react";

import type { AuthContract } from "@notils/auth-custom/contract";
import { SchemaForm } from "@notils/form-builder/schema-form";
import { Alert, AlertDescription } from "@notils/ui/components/ui/alert";
import type { z } from "zod";

/** Tier 1 component — see sign-in-form.tsx for the AuthContract-driven design rationale. */
export function SignUpForm<TUser, TSignIn, TSignUp>({
  contract,
  signUpSchema,
  onSuccess,
}: {
  contract: AuthContract<TUser, TSignIn, TSignUp>;
  signUpSchema: z.ZodType<TSignUp>;
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
        schema={signUpSchema}
        submitLabel="Sign up"
        onSubmit={async (values) => {
          setFormError(null);
          const result = await contract.signUp(values);
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

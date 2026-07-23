import { useState } from "react";

import type { AuthContract } from "@notils/auth-custom/contract";
import { SchemaForm } from "@notils/form-builder/schema-form";
import { Alert, AlertDescription } from "@notils/ui/components/ui/alert";
import { z } from "zod";

const forgotPasswordSchema = z.object({ email: z.string().email() });

/**
 * Tier 1 component. Unlike sign-in/sign-up, `requestPasswordReset` takes a
 * bare email string, not a caller-defined schema — so this component owns
 * its own minimal schema rather than requiring one as a prop.
 */
export function ForgotPasswordForm<TUser, TSignIn, TSignUp>({
  contract,
  onSuccess,
}: {
  contract: AuthContract<TUser, TSignIn, TSignUp>;
  onSuccess?: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Alert>
        <AlertDescription>
          If an account exists for that email, a reset link has been sent.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <SchemaForm
        schema={forgotPasswordSchema}
        submitLabel="Send reset link"
        onSubmit={async ({ email }) => {
          setFormError(null);
          const result = await contract.requestPasswordReset(email);
          if (result.ok) {
            setSent(true);
            onSuccess?.();
          } else {
            setFormError(result.error);
          }
        }}
      />
    </div>
  );
}

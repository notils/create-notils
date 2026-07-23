"use client";

import { SchemaForm } from "@notils/form-builder/schema-form";
import type { UiHints } from "@notils/form-builder/ui-hints";
import { z } from "zod";

/**
 * Replica of contact-form.tsx (an existing hand-built form from another
 * project), rebuilt on @notils/form-builder to validate the builder against
 * a real, non-trivial form: progressive disclosure (email/country/message
 * hidden until an enquiry type is picked) and cross-field validation via
 * superRefine. Both capabilities came from form-builder extensions added
 * alongside this file — uiHints.showWhen for the former, and the latter
 * needed no form-builder change at all (superRefine's ctx.addIssue({path})
 * already resolves to per-field errors via zodResolver, same as any other
 * react-hook-form + Zod integration).
 *
 * Not a pixel-for-pixel visual match — that would require porting the
 * original's hand-tuned Figma-spec styling into @notils/ui's token system,
 * a separate design-system task. This validates the *behavior* and the
 * form-builder's capability to express it.
 */

const ENQUIRY_TYPES = [
  "General Enquiry",
  "Product Feedback/Issue",
  "Collaboration Enquiry",
  "Wholesale/Distribution",
  "Press Enquiry",
] as const;

const COUNTRIES = ["New Zealand", "Australia", "United States", "United Kingdom"] as const;

const NAME_MAX_LENGTH = 50;
const EMAIL_MAX_LENGTH = 254;
const MESSAGE_MAX_LENGTH = 2000;

// A human name is only ever letters, plus hyphens/apostrophes/spaces for
// names like "Anne-Marie" or "O'Brien"; \p{L} covers accented characters.
const NAME_PATTERN = /^[\p{L}][\p{L}\s'-]*$/u;

const requiredName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(NAME_MAX_LENGTH, `${label} must be ${NAME_MAX_LENGTH} characters or fewer`)
    .refine((value) => NAME_PATTERN.test(value), `${label} can only contain letters`);

// Same shape as the original: email/country/message stay plain z.string() so
// walkSchema renders them unconditionally (visibility is a uiHints concern,
// not a schema concern), and superRefine gates their *validation* on
// enquiryType being set — otherwise picking an enquiry type would instantly
// reveal fields already flagged invalid.
const contactFormSchema = z
  .object({
    firstName: requiredName("First name"),
    lastName: requiredName("Last name"),
    // z.enum() (not a manual .refine() over ENQUIRY_TYPES) gives walkSchema
    // enough to render this as a <Select>, not a plain text input, while
    // keeping the exact same "must be one of these values" validation.
    enquiryType: z.enum(ENQUIRY_TYPES, { error: "Please select an enquiry type" }),
    email: z.string(),
    // .optional() (not a widened enum including "") lets the field tolerate
    // being unset while it's hidden, without a fake "" member leaking into
    // the rendered <Select> as a real, selectable, blank option — which is
    // exactly what widening the enum did. superRefine (below) still owns
    // the actual "must be a real country, once visible" requirement, same
    // division of labor as email/message.
    country: z.enum(COUNTRIES).optional(),
    message: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.enquiryType) return;

    const email = values.email.trim();
    if (!email) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Email is required" });
    } else if (email.length > EMAIL_MAX_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: `Email must be ${EMAIL_MAX_LENGTH} characters or fewer`,
      });
    } else if (!z.email().safeParse(email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address" });
    }

    if (!values.country || !(COUNTRIES as readonly string[]).includes(values.country)) {
      ctx.addIssue({ code: "custom", path: ["country"], message: "Please select a country" });
    }

    const message = values.message.trim();
    if (!message) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "Message is required" });
    } else if (message.length > MESSAGE_MAX_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["message"],
        message: `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer`,
      });
    }
  });

type ContactFormValues = z.infer<typeof contactFormSchema>;

// Every field except enquiryType hides until enquiryType has a value —
// mirrors the original's showRestOfForm boolean, expressed per-field
// instead of one big conditional block.
const hiddenUntilEnquiryType = {
  showWhen: (values: ContactFormValues) => !!values.enquiryType,
};

const uiHints: UiHints<ContactFormValues> = {
  email: hiddenUntilEnquiryType,
  country: hiddenUntilEnquiryType,
  message: hiddenUntilEnquiryType,
};

export function ContactForm() {
  return (
    <SchemaForm
      schema={contactFormSchema}
      submitLabel="Submit"
      uiHints={uiHints}
      layout={[["firstName", "lastName"], ["enquiryType"], ["email", "country"], ["message"]]}
      defaultValues={{
        firstName: "",
        lastName: "",
        email: "",
        message: "",
      }}
      onSubmit={async (_values) => {
        // TODO: wire up form submission
      }}
    />
  );
}

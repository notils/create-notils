# @notils/form-builder

A recursive Zod-schema-to-form renderer for `@notils/ui`, built on [react-hook-form](https://react-hook-form.com/) + [Zod](https://zod.dev/). Define a schema, get a validated form — reusable for any form, not just auth. See [docs/packages-and-providers-architecture.md](../../docs/packages-and-providers-architecture.md) for why this exists (no off-the-shelf library targets Base UI; the ecosystem research is documented there).

## Why this exists

Every shadcn-targeting Zod/JSON-Schema form generator found (RJSF's `@rjsf/shadcn`, AutoForm, `@json-render/shadcn`) is Radix-coupled or young/beta — none target Base UI. shadcn's own `Field` component (which this package uses) is officially primitive-agnostic, but ships with no autogeneration layer — its own docs frame manual composition as "trading autogeneration for complete flexibility." This package is that generation layer, written from scratch against `@notils/ui`'s actual components.

## What's inside

```
src/
├── walk-schema.ts       # z.ZodType -> FieldDescriptor[] — the generic, primitive-agnostic half
├── field-renderer.tsx   # FieldDescriptor -> @notils/ui controls (Input/Select/Checkbox), the swappable half
├── descriptor-field.tsx # recursion: object -> FieldSet, array -> useFieldArray, discriminated union -> conditional fields
├── ui-hints.ts          # per-field overrides: conditional visibility, className, full render override
├── schema-form.tsx      # <SchemaForm> — wires useForm + zodResolver + layout + the renderer together
└── index.ts             # public exports
```

## The split: schema-walking is generic, rendering is swappable

`walkSchema` never decides how a field looks — it only produces a `FieldDescriptor` tree (`path`, `kind`, `label`, nested `fields`/`element`/`variants`). It has no dependency on `@notils/ui`, React, or any primitive library, and works the same regardless of Radix vs. Base UI vs. anything else.

`field-renderer.tsx` is where the actual `@notils/ui` components get chosen. If you want a different layout (horizontal fields, a different primitive library, multi-page steps), write your own renderer against `FieldDescriptor` — the schema-walking logic never needs to change. This mirrors an ORM migration: you define the schema once; what gets generated from it is a separate, replaceable concern.

## Supported schema shapes

Recursive, not just flat: `z.string()` (with `.email()` detection and a `password`-named-field convention for masked input), `z.number()`, `z.boolean()`, `z.enum()`/`z.literal()` (→ select), `z.object()` (nested, recurses), `z.array()` (→ add/remove rows via `useFieldArray`), `z.discriminatedUnion()` (→ a variant picker plus the active variant's fields), and `.optional()`/`.nullable()`/`.default()` wrapping any of the above.

**Not supported**: plain `z.union()` without a discriminator (throws — use `z.discriminatedUnion()` instead) and any other Zod type not listed above (throws with a clear message naming the field and type).

## Usage

```tsx
import { z } from "zod";
import { SchemaForm } from "@notils/form-builder/schema-form";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "user"]),
});

function SignUpForm() {
  return (
    <SchemaForm
      schema={signUpSchema}
      onSubmit={(values) => {
        // values is typed from the schema — z.infer<typeof signUpSchema>
      }}
      submitLabel="Sign up"
    />
  );
}
```

For a fully custom renderer, use `walkSchema` + your own render function instead of `SchemaForm`:

```tsx
import { walkSchema } from "@notils/form-builder/walk-schema";

const descriptors = walkSchema(signUpSchema);
// descriptors.map(d => myOwnRenderer(d))
```

## Row layout

`layout` groups top-level fields into rows without forking any rendering code — a form with a 2-column/1-column/2-column arrangement (like a typical "first name + last name" pair) is just data, not a different component:

```tsx
<SchemaForm
  schema={contactFormSchema}
  layout={[
    ["firstName", "lastName"], // side by side
    ["enquiryType"],           // full width
    ["email", "country"],      // side by side
    ["message"],                // full width
  ]}
  onSubmit={...}
/>
```

Any top-level field not mentioned in `layout` still renders — as its own full-width row, in schema order, appended after the laid-out rows — so `layout` only needs to describe the parts that aren't simply "one field per row" (the default with no `layout` at all). Rows stack vertically on narrow viewports and go side by side at the `sm` breakpoint. `layout` only affects the form's top-level fields — a nested object/array/union's own fields keep their normal vertical layout regardless.

This was deliberately kept to a layout **grouping** mechanism, not a generated-code approach: the alternative (a CLI command that writes a real `.tsx` form file per schema) gives arbitrary layout freedom, but forks — a bug fix in the generator never reaches an already-generated file without hand-patching or regenerating over local edits. `layout` (plus `uiHints` below) covers real-world forms — including a full replica of a designer-built multi-row contact form, see `apps/app/src/app/contact-form-replica.tsx` — while staying inside the fixable, reusable core.

## Per-field overrides — `uiHints`

For anything `walkSchema` can't infer from the schema alone — conditional visibility, one-off styling, or a fully custom control — pass `uiHints`, keyed by field path:

```tsx
import type { UiHints } from "@notils/form-builder/ui-hints";

const uiHints: UiHints<z.infer<typeof contactFormSchema>> = {
  // hide until enquiryType has a value
  email: { showWhen: (values) => !!values.enquiryType },
  country: { showWhen: (values) => !!values.enquiryType },
  // extra classes merged onto the default control
  message: { showWhen: (values) => !!values.enquiryType, className: "min-h-32" },
};

<SchemaForm schema={contactFormSchema} uiHints={uiHints} onSubmit={...} />
```

A field with no matching hint renders exactly as it would without `uiHints` at all — hints are additive, never required. Cross-field *validation* (as opposed to visibility) needs no form-builder support: a Zod `.superRefine()` that calls `ctx.addIssue({ path: ["email"], message: "..." })` already resolves to that field's error via `zodResolver`, the same as any other react-hook-form + Zod integration.

## Known limitation

`zodResolver`'s TypeScript overloads don't cleanly accept a generic `z.ZodType<TSchema>` (an open upstream issue, [react-hook-form/resolvers#842](https://github.com/react-hook-form/resolvers/issues/842), tied to Zod v4's branded-type changes). `schema-form.tsx` isolates this with a narrow, documented `as never` at the one call site — the runtime validation behavior is correct; only that specific type-level overload match fails.

## Verify

```bash
bun run typecheck   # from this package, or from the repo root for the whole workspace
```

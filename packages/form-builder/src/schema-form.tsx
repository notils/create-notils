import type { ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DefaultValues,
  type FieldValues,
  FormProvider,
  useForm,
  useWatch,
} from "react-hook-form";
import type { z } from "zod";

type SchemaOutput<TSchema extends z.ZodType> = z.infer<TSchema> & FieldValues;

import { DescriptorField } from "@notils/form-builder/descriptor-field";
import type { UiHints } from "@notils/form-builder/ui-hints";
import { type FieldDescriptor, walkSchema } from "@notils/form-builder/walk-schema";
import { Button } from "@notils/ui/components/ui/button";
import { FieldGroup } from "@notils/ui/components/ui/field";
import type { Control } from "react-hook-form";

/**
 * Groups TOP-LEVEL descriptors into rows: each entry in `layout` is one row
 * of field paths that render side by side. A path not mentioned in `layout`
 * falls back to its own full-width row, in schema order, appended after the
 * laid-out rows — so `layout` only needs to describe the parts of the form
 * that aren't simply "one field per row" (the default with no layout at all).
 *
 * Nested fields (inside an object/array/union) are unaffected — layout only
 * applies to the form's own top-level fields; a nested FieldSet still lays
 * out its own children vertically via DescriptorField.
 */
function groupIntoRows(descriptors: FieldDescriptor[], layout?: string[][]): FieldDescriptor[][] {
  if (!layout) {
    return descriptors.map((d) => [d]);
  }
  const byPath = new Map(descriptors.map((d) => [d.path, d]));
  const placed = new Set<string>();
  const rows: FieldDescriptor[][] = [];

  for (const row of layout) {
    const rowFields = row.map((path) => byPath.get(path)).filter((d): d is FieldDescriptor => !!d);
    if (rowFields.length > 0) {
      rows.push(rowFields);
      for (const path of row) {
        placed.add(path);
      }
    }
  }
  for (const descriptor of descriptors) {
    if (!placed.has(descriptor.path)) {
      rows.push([descriptor]);
    }
  }
  return rows;
}

/**
 * Renders one row from groupIntoRows. Skips rendering the row wrapper
 * entirely when every field in it is hidden by uiHints.showWhen — an empty
 * row `<div>` still counts toward FieldGroup's own gap between rows, which
 * shows up as visible extra space above the submit button when several
 * hidden rows stack up (e.g. before an enquiry type is picked). Each
 * DescriptorField also independently checks its own showWhen, so this is
 * only an optimization/visual fix at the row level, not a duplicate source
 * of truth for visibility.
 */
function FormRow<TFieldValues extends FieldValues>({
  row,
  control,
  uiHints,
}: {
  row: FieldDescriptor[];
  control: Control<TFieldValues>;
  uiHints?: UiHints<TFieldValues>;
}) {
  const rowHasHint = row.some((d) => uiHints?.[d.path]?.showWhen);
  const allValues = useWatch({ control, disabled: !rowHasHint }) as TFieldValues;
  const anyVisible = row.some((d) => {
    const showWhen = uiHints?.[d.path]?.showWhen;
    return !showWhen || showWhen(allValues);
  });

  if (!anyVisible) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 @sm/field-group:flex-row *:flex-1">
      {row.map((descriptor) => (
        <DescriptorField
          key={descriptor.path}
          descriptor={descriptor}
          control={control}
          uiHints={uiHints}
        />
      ))}
    </div>
  );
}

/**
 * Renders a form from a Zod object schema: walks the schema into
 * FieldDescriptors, wires react-hook-form + zodResolver for validation, and
 * renders each field via DescriptorField (which recurses into nested
 * objects/arrays/discriminated unions on its own).
 *
 * This is intentionally the ONLY place schema-walking and form-state wiring
 * meet — everything above (walkSchema) and below (DescriptorField,
 * field-renderer) is reusable independent of react-hook-form specifically.
 */
export function SchemaForm<TSchema extends z.ZodType>({
  schema,
  defaultValues,
  onSubmit,
  submitLabel = "Submit",
  uiHints,
  layout,
  children,
}: {
  schema: TSchema;
  defaultValues?: DefaultValues<SchemaOutput<TSchema>>;
  onSubmit: (values: SchemaOutput<TSchema>) => void | Promise<void>;
  submitLabel?: ReactNode;
  /**
   * Per-field overrides keyed by field path — conditional visibility
   * (`showWhen`), style tweaks (`className`), or a full custom render.
   * See ui-hints.ts. Optional; omit entirely for the default behavior.
   */
  uiHints?: UiHints<SchemaOutput<TSchema>>;
  /**
   * Groups top-level fields into rows, e.g. `[["firstName", "lastName"],
   * ["email"]]` renders firstName+lastName side by side, email on its own
   * row below. Fields not mentioned render as their own full-width row, in
   * schema order, after the laid-out rows. Omit entirely for one field per
   * row (the default). Only affects top-level fields — nested object/array/
   * union fields keep their own vertical layout regardless.
   */
  layout?: string[][];
  /** Extra content rendered after the fields and before the submit button (e.g. a "forgot password?" link). */
  children?: ReactNode;
}) {
  const descriptors = walkSchema(schema);
  const rows = groupIntoRows(descriptors, layout);
  const form = useForm<SchemaOutput<TSchema>>({
    // zodResolver's overloads expect the schema's *input* type to already be
    // FieldValues, which a generic z.ZodType<TSchema> can't statically prove —
    // a known upstream friction with Zod v4 (react-hook-form/resolvers#842).
    // The runtime behavior is correct; only the type-level overload match fails.
    resolver: zodResolver(schema as never) as never,
    defaultValues,
  });

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values);
        })}
      >
        <FieldGroup>
          {rows.map((row) => (
            <FormRow
              key={row.map((d) => d.path).join("+")}
              row={row}
              control={form.control}
              uiHints={uiHints}
            />
          ))}
          {children}
          <SubmitButton label={submitLabel} isSubmitting={form.formState.isSubmitting} />
        </FieldGroup>
      </form>
    </FormProvider>
  );
}

function SubmitButton({ label, isSubmitting }: { label: ReactNode; isSubmitting: boolean }) {
  return (
    <Button type="submit" disabled={isSubmitting} data-slot="schema-form-submit">
      {isSubmitting ? "Submitting…" : label}
    </Button>
  );
}

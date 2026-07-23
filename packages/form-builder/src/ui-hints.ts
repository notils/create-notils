import type { ReactNode } from "react";

import type { FieldDescriptor } from "@notils/form-builder/walk-schema";
import type { Control, FieldValues } from "react-hook-form";

/**
 * Per-field rendering overrides, keyed by FieldDescriptor.path — the escape
 * hatch for anything walkSchema genuinely can't infer from the Zod schema
 * alone: conditional visibility, pixel-specific styling, or a fully custom
 * control. Optional everywhere; a field with no hint renders exactly as it
 * would without this mechanism.
 *
 * This is metadata *alongside* the schema, not derived from it — Zod has no
 * way to express "hide this field until another field has a value," so it
 * has to be told, not inferred.
 */
export type FieldUiHint<TFieldValues extends FieldValues = FieldValues> = {
  /**
   * Show this field only when the predicate returns true, evaluated against
   * the form's live values on every render (via react-hook-form's
   * `useWatch`). Omit to always show the field (the default, existing
   * behavior). A hidden field is not unmounted from the DOM tree in a way
   * that loses its registration — it's simply not rendered by
   * DescriptorField, and react-hook-form keeps its last value; validation
   * for hidden fields is the schema's job (see the superRefine pattern:
   * gate the cross-field check on the same condition used here).
   */
  showWhen?: (values: TFieldValues) => boolean;
  /** Extra class names merged onto the rendered control (appended after the default classes via `cn()`). */
  className?: string;
  /**
   * Full render override — receives the descriptor and the RHF control, and
   * is responsible for rendering the entire field (label, control, error).
   * Use this when the default `@notils/ui` control isn't the right shape at
   * all (a custom multi-select, a rich text editor, etc.), not for styling
   * tweaks — use `className` for those.
   */
  render?: (descriptor: FieldDescriptor, control: Control<TFieldValues>) => ReactNode;
};

export type UiHints<TFieldValues extends FieldValues = FieldValues> = Record<
  string,
  FieldUiHint<TFieldValues>
>;

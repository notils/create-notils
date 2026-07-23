import type { FieldDescriptor, PrimitiveFieldDescriptor } from "@notils/form-builder/walk-schema";
import { Checkbox } from "@notils/ui/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@notils/ui/components/ui/field";
import { Input } from "@notils/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@notils/ui/components/ui/select";
import { cn } from "@notils/ui/lib/utils";
import { type Control, Controller, type FieldValues } from "react-hook-form";

/**
 * Renders one PrimitiveFieldDescriptor as a @notils/ui-styled control, wired
 * to react-hook-form via Controller. Controller (not plain `register`) is
 * required for Select/Checkbox — Base UI's primitives are controlled
 * components (`value`/`onValueChange`, `checked`/`onCheckedChange`), not
 * native `<input>` elements `register` can attach a ref to directly.
 *
 * This is the swappable half of the form builder: a caller can pass their
 * own render function with the same signature to `SchemaForm` to render
 * fields differently (a different primitive library, horizontal layout,
 * custom widgets) without touching `walkSchema`'s schema-walking logic.
 */
export function renderPrimitiveField<TFieldValues extends FieldValues>(
  descriptor: PrimitiveFieldDescriptor,
  control: Control<TFieldValues>,
  className?: string
) {
  return (
    <Controller
      key={descriptor.path}
      name={descriptor.name as never}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={!!fieldState.error} orientation="vertical">
          <FieldContent>
            <FieldLabel htmlFor={descriptor.path}>
              {descriptor.label}
              {!descriptor.optional && <span aria-hidden="true"> *</span>}
            </FieldLabel>
            {renderControl(descriptor, field, className)}
            {descriptor.description && (
              <FieldDescription>{descriptor.description}</FieldDescription>
            )}
          </FieldContent>
          <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
        </Field>
      )}
    />
  );
}

type ControllerField = {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  name: string;
};

function renderControl(
  descriptor: PrimitiveFieldDescriptor,
  field: ControllerField,
  className?: string
) {
  switch (descriptor.kind) {
    case "checkbox":
      return (
        <Checkbox
          id={descriptor.path}
          checked={Boolean(field.value)}
          onCheckedChange={(checked) => field.onChange(checked)}
          onBlur={field.onBlur}
          className={className}
        />
      );
    case "select":
      return (
        <Select
          value={field.value == null ? "" : String(field.value)}
          onValueChange={(value) => field.onChange(value)}
        >
          <SelectTrigger id={descriptor.path} className={cn("w-full", className)}>
            <SelectValue placeholder={`Select ${descriptor.label.toLowerCase()}`} />
          </SelectTrigger>
          {/*
            alignItemWithTrigger (Base UI's default) overlaps the popup with
            the trigger so the SELECTED item's text lines up with the
            trigger's displayed value — this reserves vertical space based on
            where the selected item sits in the list, which shows up as
            excess/misaligned space above the options when there's no
            selection yet (or the value doesn't match a real option, as with
            our "" placeholder default). Disabling it falls back to normal
            below-the-trigger positioning, which is what every field here
            actually wants.
          */}
          <SelectContent alignItemWithTrigger={false}>
            {descriptor.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "number":
      return (
        <Input
          id={descriptor.path}
          type="number"
          value={field.value == null ? "" : String(field.value)}
          onChange={(e) =>
            field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
          }
          onBlur={field.onBlur}
          className={className}
        />
      );
    case "password":
      return (
        <Input
          id={descriptor.path}
          type="password"
          value={(field.value as string | undefined) ?? ""}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          maxLength={descriptor.maxLength}
          className={className}
        />
      );
    case "email":
      return (
        <Input
          id={descriptor.path}
          type="email"
          value={(field.value as string | undefined) ?? ""}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          maxLength={descriptor.maxLength}
          className={className}
        />
      );
    default:
      return (
        <Input
          id={descriptor.path}
          type="text"
          value={(field.value as string | undefined) ?? ""}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          maxLength={descriptor.maxLength}
          className={className}
        />
      );
  }
}

/** Type guard used by SchemaForm to dispatch object/array/union descriptors to their own recursive renderers. */
export function isPrimitiveDescriptor(
  descriptor: FieldDescriptor
): descriptor is PrimitiveFieldDescriptor {
  return descriptor.kind !== "object" && descriptor.kind !== "array" && descriptor.kind !== "union";
}

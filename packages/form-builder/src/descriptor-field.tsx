import { isPrimitiveDescriptor, renderPrimitiveField } from "@notils/form-builder/field-renderer";
import type { UiHints } from "@notils/form-builder/ui-hints";
import type { FieldDescriptor } from "@notils/form-builder/walk-schema";
import { Button } from "@notils/ui/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@notils/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@notils/ui/components/ui/select";
import {
  type Control,
  Controller,
  type FieldValues,
  useFieldArray,
  useWatch,
} from "react-hook-form";

/**
 * Dispatches one FieldDescriptor to its renderer: a primitive control
 * (renderPrimitiveField), or one of the three recursive cases below.
 * This is the piece that actually recurses — walkSchema only produces the
 * descriptor tree, it never renders anything.
 *
 * `uiHints` (optional, keyed by descriptor.path) is the escape hatch for
 * what walkSchema can't infer from the schema alone: conditional visibility
 * (`showWhen`), style overrides (`className`), or a fully custom render.
 * A field with no matching hint renders exactly as it would without this
 * mechanism — hints are additive, never required.
 */
export function DescriptorField<TFieldValues extends FieldValues>({
  descriptor,
  control,
  uiHints,
}: {
  descriptor: FieldDescriptor;
  control: Control<TFieldValues>;
  uiHints?: UiHints<TFieldValues>;
}) {
  const hint = uiHints?.[descriptor.path];

  // useWatch is called unconditionally (rules of hooks) but disabled when
  // there's no showWhen — so fields without a visibility hint pay no
  // subscription/re-render cost, only the ones that opt in.
  const allValues = useWatch({ control, disabled: !hint?.showWhen }) as TFieldValues;
  if (hint?.showWhen && !hint.showWhen(allValues)) {
    return null;
  }

  if (hint?.render) {
    return hint.render(descriptor, control);
  }

  if (isPrimitiveDescriptor(descriptor)) {
    return renderPrimitiveField(descriptor, control, hint?.className);
  }

  switch (descriptor.kind) {
    case "object":
      return (
        <FieldSet>
          <FieldLegend variant="label">{descriptor.label}</FieldLegend>
          <FieldGroup>
            {descriptor.fields.map((field) => (
              <DescriptorField
                key={field.path}
                descriptor={field}
                control={control}
                uiHints={uiHints}
              />
            ))}
          </FieldGroup>
        </FieldSet>
      );
    case "array":
      return <ArrayDescriptorField descriptor={descriptor} control={control} uiHints={uiHints} />;
    case "union":
      return <UnionDescriptorField descriptor={descriptor} control={control} uiHints={uiHints} />;
    default:
      return null;
  }
}

function ArrayDescriptorField<TFieldValues extends FieldValues>({
  descriptor,
  control,
  uiHints,
}: {
  descriptor: Extract<FieldDescriptor, { kind: "array" }>;
  control: Control<TFieldValues>;
  uiHints?: UiHints<TFieldValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: descriptor.path as never,
  });

  return (
    <FieldSet>
      <FieldLegend variant="label">{descriptor.label}</FieldLegend>
      <FieldGroup>
        {fields.map((row, index) => (
          <Field key={row.id} orientation="horizontal">
            <div className="flex-1">
              <DescriptorField
                descriptor={reindexDescriptor(descriptor.element, descriptor.path, index)}
                control={control}
                uiHints={uiHints}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => remove(index)}
              aria-label={`Remove ${descriptor.label} ${index + 1}`}
            >
              &times;
            </Button>
          </Field>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(emptyValueFor(descriptor.element) as never)}
        >
          Add {descriptor.label.toLowerCase()}
        </Button>
      </FieldGroup>
    </FieldSet>
  );
}

/** A reasonable blank value for a new array row, derived from the element descriptor's kind. */
function emptyValueFor(descriptor: FieldDescriptor): unknown {
  switch (descriptor.kind) {
    case "checkbox":
      return false;
    case "number":
      return undefined;
    case "object": {
      const entries = descriptor.fields.map((f) => [f.path.split(".").pop(), emptyValueFor(f)]);
      return Object.fromEntries(entries);
    }
    case "array":
      return [];
    case "union":
      return {};
    default:
      return "";
  }
}

/** Rewrites an array element's descriptor path/name from the "<path>.0" template to the real row index. */
function reindexDescriptor(
  descriptor: FieldDescriptor,
  arrayPath: string,
  index: number
): FieldDescriptor {
  const prefix = `${arrayPath}.0`;
  const nextPrefix = `${arrayPath}.${index}`;
  const path = descriptor.path.replace(prefix, nextPrefix);
  const name = descriptor.name.replace(prefix, nextPrefix);
  if (descriptor.kind === "object") {
    return {
      ...descriptor,
      path,
      name,
      fields: descriptor.fields.map((f) => reindexDescriptor(f, arrayPath, index)),
    };
  }
  if (descriptor.kind === "array") {
    return {
      ...descriptor,
      path,
      name,
      element: reindexDescriptor(descriptor.element, arrayPath, index),
    };
  }
  if (descriptor.kind === "union") {
    return {
      ...descriptor,
      path,
      name,
      variants: descriptor.variants.map((v) => ({
        ...v,
        fields: v.fields.map((f) => reindexDescriptor(f, arrayPath, index)),
      })),
    };
  }
  return { ...descriptor, path, name };
}

function UnionDescriptorField<TFieldValues extends FieldValues>({
  descriptor,
  control,
  uiHints,
}: {
  descriptor: Extract<FieldDescriptor, { kind: "union" }>;
  control: Control<TFieldValues>;
  uiHints?: UiHints<TFieldValues>;
}) {
  const discriminatorPath = `${descriptor.path}.${descriptor.discriminator}`;
  const discriminatorValue = useWatch({ control, name: discriminatorPath as never }) as unknown as
    | string
    | undefined;

  const activeVariant =
    descriptor.variants.find((v) => v.value === discriminatorValue) ?? descriptor.variants[0];

  return (
    <FieldSet>
      <FieldLegend variant="label">{descriptor.label}</FieldLegend>
      <FieldGroup>
        <Controller
          name={discriminatorPath as never}
          control={control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={discriminatorPath}>{descriptor.label} type</FieldLabel>
              <Select
                value={field.value == null ? "" : String(field.value)}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger id={discriminatorPath}>
                  <SelectValue placeholder={`Select ${descriptor.label.toLowerCase()} type`} />
                </SelectTrigger>
                {/* See field-renderer.tsx's Select case: alignItemWithTrigger
                    reserves vertical space for aligning the *selected* item
                    with the trigger, which misbehaves before a selection
                    exists — disable it for the same reason here. */}
                <SelectContent alignItemWithTrigger={false}>
                  {descriptor.variants.map((variant) => (
                    <SelectItem key={variant.value} value={variant.value}>
                      {variant.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        {activeVariant?.fields.map((field) => (
          <DescriptorField
            key={field.path}
            descriptor={field}
            control={control}
            uiHints={uiHints}
          />
        ))}
      </FieldGroup>
    </FieldSet>
  );
}

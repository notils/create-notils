import type { z } from "zod";

/**
 * Walks a Zod schema into a tree of FieldDescriptors the renderer can
 * dispatch on, without the renderer ever needing to know about Zod's
 * internal schema representation. This is the entire "generic" half of the
 * form builder — it never decides how a field looks, only what it is.
 *
 * Built against Zod v4's `.def` introspection shape (confirmed against the
 * installed zod@4.4.x). Note: `z.ZodType` (the classic/public API), not
 * `z.core.$ZodType`, is what actually types `.def` — the core interface
 * only exposes it via `_zod.def` internals.
 *
 * `.def.type` is a stable discriminant ("object" | "string" | "number" |
 * "boolean" | "enum" | "literal" | "array" | "union" | "optional" |
 * "nullable" | "default" | ...). `optional`/`nullable`/`default` are
 * unwrapped transparently — the descriptor for the wrapped field carries
 * `optional: true`, not a separate descriptor kind, since "is this
 * required" is a rendering concern (e.g. a required-field asterisk), not a
 * different kind of input.
 */

export type PrimitiveKind = "text" | "email" | "password" | "number" | "checkbox" | "select";

export type BaseFieldDescriptor = {
  /** Dot-path into the form values, e.g. "address.city" or "items.0.name". */
  path: string;
  /** react-hook-form register name — identical to `path` for non-array fields. */
  name: string;
  label: string;
  description?: string;
  optional: boolean;
};

export type PrimitiveFieldDescriptor = BaseFieldDescriptor & {
  kind: PrimitiveKind;
  /** Only present when kind === "select": the enum's option values. */
  options?: string[];
  /** From z.string().max(n) — passed through as the HTML maxLength attribute. */
  maxLength?: number;
};

export type ObjectFieldDescriptor = BaseFieldDescriptor & {
  kind: "object";
  fields: FieldDescriptor[];
};

export type ArrayFieldDescriptor = BaseFieldDescriptor & {
  kind: "array";
  /** Descriptor template for one array item — cloned per row by the renderer with an indexed path. */
  element: FieldDescriptor;
};

export type UnionFieldDescriptor = BaseFieldDescriptor & {
  kind: "union";
  /** The field name that selects which variant is active, e.g. "type" in z.discriminatedUnion("type", [...]). */
  discriminator: string;
  /** One field set per variant, keyed by that variant's discriminator literal value. */
  variants: Array<{ value: string; fields: FieldDescriptor[] }>;
};

export type FieldDescriptor =
  | PrimitiveFieldDescriptor
  | ObjectFieldDescriptor
  | ArrayFieldDescriptor
  | UnionFieldDescriptor;

function humanizeLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Guesses the input kind for a leaf z.string() field from its name/checks — no separate config needed for the common case. */
function stringKind(path: string, checks: z.core.$ZodStringDef["checks"]): PrimitiveKind {
  const lastSegment = path.split(".").pop() ?? path;
  if (/password/i.test(lastSegment)) {
    return "password";
  }
  const hasEmailFormat = checks?.some((check) => {
    const checkDef = check._zod.def as { format?: string };
    return checkDef.format === "email";
  });
  if (hasEmailFormat || /email/i.test(lastSegment)) {
    return "email";
  }
  return "text";
}

/** Reads a z.string().max(n) constraint (Zod v4's "max_length" check kind) — undefined if unset. */
function maxLengthFor(checks: z.core.$ZodStringDef["checks"]): number | undefined {
  for (const check of checks ?? []) {
    const checkDef = check._zod.def as { check?: string; maximum?: number };
    if (checkDef.check === "max_length" && typeof checkDef.maximum === "number") {
      return checkDef.maximum;
    }
  }
  return undefined;
}

type UnwrapResult = { schema: z.ZodType; optional: boolean };

/** Strips ZodOptional/ZodNullable/ZodDefault wrappers, tracking whether any made the field optional. */
function unwrap(schema: z.ZodType): UnwrapResult {
  if (schema.def.type === "optional") {
    const inner = unwrap((schema.def as z.core.$ZodOptionalDef).innerType as z.ZodType);
    return { schema: inner.schema, optional: true };
  }
  if (schema.def.type === "nullable") {
    const inner = unwrap((schema.def as z.core.$ZodNullableDef).innerType as z.ZodType);
    return { schema: inner.schema, optional: true };
  }
  if (schema.def.type === "default") {
    const inner = unwrap((schema.def as z.core.$ZodDefaultDef).innerType as z.ZodType);
    return { schema: inner.schema, optional: true };
  }
  return { schema, optional: false };
}

function walkField(rawSchema: z.ZodType, path: string): FieldDescriptor {
  const { schema, optional } = unwrap(rawSchema);
  const def = schema.def;
  const label = humanizeLabel(path.split(".").pop() ?? path);
  const description = schema.description;
  const base: BaseFieldDescriptor = { path, name: path, label, description, optional };

  switch (def.type) {
    case "string": {
      const checks = (def as z.core.$ZodStringDef).checks;
      return {
        ...base,
        kind: stringKind(path, checks),
        maxLength: maxLengthFor(checks),
      };
    }
    case "number":
      return { ...base, kind: "number" };
    case "boolean":
      return { ...base, kind: "checkbox" };
    case "enum": {
      const entries = (def as z.core.$ZodEnumDef).entries;
      return { ...base, kind: "select", options: Object.values(entries).map(String) };
    }
    case "literal": {
      const values = (def as z.core.$ZodLiteralDef<z.core.util.Literal>).values;
      return { ...base, kind: "select", options: values.map(String) };
    }
    case "object": {
      const shape = (def as z.core.$ZodObjectDef).shape as Record<string, z.ZodType>;
      const fields = Object.entries(shape).map(([key, childSchema]) =>
        walkField(childSchema, path ? `${path}.${key}` : key)
      );
      return { ...base, kind: "object", fields };
    }
    case "array": {
      const element = (def as z.core.$ZodArrayDef).element as z.ZodType;
      return { ...base, kind: "array", element: walkField(element, `${path}.0`) };
    }
    case "union": {
      const unionDef = def as z.core.$ZodUnionDef;
      const discriminator = (unionDef as { discriminator?: string }).discriminator;
      const options = unionDef.options as z.ZodType[];
      if (!discriminator) {
        throw new Error(
          `walkSchema: non-discriminated unions are not supported (field "${path}"). Use z.discriminatedUnion() instead of z.union().`
        );
      }
      const variants = options.map((variant) => {
        const variantShape = (variant.def as z.core.$ZodObjectDef).shape as Record<
          string,
          z.ZodType
        >;
        const discriminatorSchema = variantShape[discriminator];
        const discriminatorValues = discriminatorSchema
          ? (discriminatorSchema.def as z.core.$ZodLiteralDef<z.core.util.Literal>).values
          : undefined;
        const value = String(discriminatorValues?.[0]);
        const fields = Object.entries(variantShape)
          .filter(([key]) => key !== discriminator)
          .map(([key, childSchema]) => walkField(childSchema, `${path}.${key}`));
        return { value, fields };
      });
      return { ...base, kind: "union", discriminator, variants };
    }
    default:
      throw new Error(
        `walkSchema: unsupported schema type "${def.type}" at field "${path}". Supported: string, number, boolean, enum, literal, object, array, discriminatedUnion (and optional/nullable/default wrapping any of these).`
      );
  }
}

/**
 * Entry point: walks a top-level Zod object schema into FieldDescriptors.
 * Only object schemas are accepted at the root — a form's fields must come
 * from named keys, not a bare primitive/array.
 */
export function walkSchema(schema: z.ZodType): FieldDescriptor[] {
  if (schema.def.type !== "object") {
    throw new Error(
      `walkSchema: root schema must be a z.object(), got "${schema.def.type}". Wrap primitive fields in z.object({...}).`
    );
  }
  const shape = (schema.def as z.core.$ZodObjectDef).shape as Record<string, z.ZodType>;
  return Object.entries(shape).map(([key, childSchema]) => walkField(childSchema, key));
}

// Shared validation utilities

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && value > 0 && isFinite(value);
}

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && isFinite(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isInEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validate(
  rules: Array<{ field: string; valid: boolean; message: string }>,
): ValidationError[] {
  return rules.filter((r) => !r.valid).map(({ field, message }) => ({ field, message }));
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map((e) => `${e.field}: ${e.message}`).join("; ");
}

// Input validation utilities

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: unknown) => string | null;
}

export function validate(data: unknown, rules: ValidationRule[]): string[] {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null) {
    return ['Request body must be an object'];
  }

  const obj = data as Record<string, unknown>;

  for (const rule of rules) {
    const value = obj[rule.field];

    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${rule.field} is required`);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (rule.type) {
      if (rule.type === 'array') {
        if (!Array.isArray(value)) {
          errors.push(`${rule.field} must be an array`);
          continue;
        }
      } else if (typeof value !== rule.type) {
        errors.push(`${rule.field} must be a ${rule.type}`);
        continue;
      }
    }

    if (typeof value === 'string') {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push(`${rule.field} must be at least ${rule.minLength} characters`);
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push(`${rule.field} must be at most ${rule.maxLength} characters`);
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`${rule.field} has invalid format`);
      }
    }

    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push(`${rule.field} must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push(`${rule.field} must be at most ${rule.max}`);
      }
    }

    if (rule.custom) {
      const err = rule.custom(value);
      if (err) errors.push(err);
    }
  }

  return errors;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string') return 'email must be a string';
  if (!EMAIL_PATTERN.test(email)) return 'email has invalid format';
  return null;
}

export function validatePositiveNumber(field: string, value: unknown): string | null {
  if (typeof value !== 'number') return `${field} must be a number`;
  if (value <= 0) return `${field} must be positive`;
  return null;
}

export function validateNonNegativeNumber(field: string, value: unknown): string | null {
  if (typeof value !== 'number') return `${field} must be a number`;
  if (value < 0) return `${field} must be non-negative`;
  return null;
}

export function validateEnum(field: string, value: unknown, allowed: string[]): string | null {
  if (typeof value !== 'string') return `${field} must be a string`;
  if (!allowed.includes(value)) return `${field} must be one of: ${allowed.join(', ')}`;
  return null;
}

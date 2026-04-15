import { ValidationError } from './errors.js';

/**
 * Regular expression for UUID v4 format validation.
 * Accepts both uppercase and lowercase hex digits.
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID format.
 * Returns the value if valid, throws ValidationError if not.
 *
 * @param value - The string to validate
 * @param fieldName - Name of the field (for error message), e.g. "--thread"
 * @returns The validated UUID string
 * @throws ValidationError if the value is not a valid UUID
 */
export function validateUuid(value: string, fieldName: string): string {
  if (!UUID_REGEX.test(value)) {
    throw new ValidationError(fieldName, value, `Invalid UUID for ${fieldName}: "${value}"`);
  }
  return value;
}

import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordPolicySchema = z
  .string({ error: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters` })
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((value) => !value.includes('\0'), 'Password contains invalid characters')
  .refine((value) => value.trim().length >= PASSWORD_MIN_LENGTH || /\S/.test(value), 'Password cannot be whitespace only');

export function validatePasswordStrength(
  password: unknown,
): { ok: true; password: string } | { ok: false; error: string } {
  const parsed = passwordPolicySchema.safeParse(password);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || 'Password does not meet security policy' };
  }
  return { ok: true, password: parsed.data };
}

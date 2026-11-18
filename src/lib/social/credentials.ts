import { decryptField, encryptField, isEncryptedField } from '@/lib/security/field-encryption';

/** The existing Settings key is retained. Legacy JSON is read-only; every write encrypts. */
export function storeSocialCredential(record: object): string { return encryptField(JSON.stringify(record)); }
export function readSocialCredential(value: string): string { return isEncryptedField(value) ? decryptField(value) : value; }
export function canManageSocial(role: string): boolean { return ['super_admin', 'platform_super_admin', 'admin'].includes(role); }

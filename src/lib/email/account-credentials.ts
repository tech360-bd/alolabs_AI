import { decryptField, encryptField, isEncryptedField } from '@/lib/security/field-encryption';

// These mailboxes are global, not tenant-owned. Read legacy JSON for migration;
// editing an account rewrites it under the operator's field encryption key.
export const canManageMail = (role: string) => ['admin', 'super_admin', 'platform_super_admin'].includes(role);
export const readMailAccount = (s: string) => isEncryptedField(s) ? decryptField(s) : s;
export const storeMailAccount = (a: object) => encryptField(JSON.stringify(a));

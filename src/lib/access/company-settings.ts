export function canManageCompanySettings(user: { role: string; companyRole?: string }) {
  return user.role === 'super_admin' || ['owner', 'admin'].includes(user.companyRole ?? '');
}

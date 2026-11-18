/** Queue payloads and manual job controls are global infrastructure, not tenant data. */
export const mayOperateQueues = (role: string) => ['super_admin', 'platform_super_admin', 'infrastructure_admin'].includes(role);

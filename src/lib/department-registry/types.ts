/**
 * Department Registry Type Definitions
 * ALO Labs AIOS — 100-department architecture types.
 */

export interface DepartmentConfig {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  group: string;
  description: string;
  directorAgentId?: string;
  managerAgentIds: string[];
  specialistAgentIds: string[];
  workerAgentIds: string[];
  tools: string[];
  knowledgeSources: string[];
  allowedModels: string[];
  allowedProviders: string[];
  permissions: string[];
  budgetLimit: number;
  priority: number;
  status: 'active' | 'inactive' | 'archived';
  sla: { responseTimeMs: number; uptimePercent: number };
  kpis: string[];
  agentCount: number;
}

export interface DepartmentRegistry {
  getDepartment(id: string): DepartmentConfig | undefined;
  getDepartmentByCode(code: string): DepartmentConfig | undefined;
  getDepartmentsByGroup(group: string): DepartmentConfig[];
  getAllDepartments(): DepartmentConfig[];
  getActiveDepartments(): DepartmentConfig[];
  addDepartment(dept: DepartmentConfig): void;
  updateDepartment(id: string, updates: Partial<DepartmentConfig>): void;
  getDepartmentForAgent(agentId: string): DepartmentConfig | undefined;
}

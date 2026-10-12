/**
 * Department Registry — Public API
 * ALO Labs AIOS — Singleton access to the 100-department registry.
 */

import { DepartmentRegistryImpl } from './registry';
export type { DepartmentConfig, DepartmentRegistry } from './types';
export { DepartmentRegistryImpl } from './registry';

let _registry: DepartmentRegistryImpl | null = null;

export function getDepartmentRegistry(): DepartmentRegistryImpl {
  if (!_registry) _registry = new DepartmentRegistryImpl();
  return _registry;
}

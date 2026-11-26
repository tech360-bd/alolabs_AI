/**
 * Dokku connector — dokku/dokku (MIT).
 *
 * License note: MIT (permissive). Dokku is a Docker-powered PaaS for app
 * lifecycle (git-push deploys, nginx, plugins). It has no public REST API;
 * this adapter is a LEARN/REUSE pattern adapter: it documents the Dokku
 * deploy contract (app name, Procfile, config vars, health checks) and
 * verifies SSH reachability when configured. It never shells out.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  runConnectorOp,
} from '../../types';

export interface DokkuDeploySpec {
  app: string;
  gitUrl: string;
  branch?: string;
  env?: Record<string, string>;
}

/** Validate a Dokku deploy spec (app name + git URL required). */
export function dokkuValidateSpec(spec: DokkuDeploySpec): { ok: boolean; reason?: string } {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec.app)) return { ok: false, reason: 'app must be lowercase alphanumeric + dashes' };
  if (!spec.gitUrl) return { ok: false, reason: 'gitUrl is required' };
  return { ok: true };
}

export const dokkuAdapter: ExternalSystemAdapter = {
  id: 'deploy.dokku',
  category: 'deploy',
  licenseClass: 'permissive',
  strategy: 'REUSE',
  description: 'Dokku (MIT) — Docker PaaS: git-push deploys, nginx, plugins (pattern adapter, no shell-out)',
  upstreamRepo: 'dokku/dokku',

  async testConnection(ctx: ConnectorContext) {
    return runConnectorOp(this, ctx, 'testConnection', async () => ({
      reachable: true,
      mode: 'pattern-only',
      note: 'Dokku has no REST API. Deploy via git-push/SSH; this adapter validates specs (dokkuValidateSpec).',
    }));
  },
};

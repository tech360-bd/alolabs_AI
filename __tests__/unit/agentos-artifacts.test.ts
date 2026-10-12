/**
 * AgentOS Artifact system — versioning, checksums, run reports.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { fakeDb, resetAgentOsMocks } from '../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));

import {
  createArtifact,
  createArtifactVersion,
  getArtifact,
  listArtifacts,
  deleteArtifact,
  verifyChecksum,
  buildRunReportArtifact,
} from '@/lib/artifacts';

beforeEach(() => resetAgentOsMocks());

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('AgentOS artifacts', () => {
  it('createArtifact stores content with sha256 checksum, size and version 1', async () => {
    const artifact = await createArtifact({
      name: 'counselor-report.md',
      type: 'report',
      content: '# Counselor Report\n\nUniversities ranked.',
      companyId: 'company-1',
      createdBy: 'user-1',
    });

    expect(artifact.id).toBeTruthy();
    expect(artifact.version).toBe(1);
    expect(artifact.checksum).toBe(sha256('# Counselor Report\n\nUniversities ranked.'));
    expect(artifact.size).toBe(Buffer.byteLength('# Counselor Report\n\nUniversities ranked.', 'utf8'));
    expect(artifact.mimeType).toBe('text/markdown');
    expect(verifyChecksum(artifact)).toBe(true);
  });

  it('createArtifactVersion creates v2 linked to v1 with previous checksum', async () => {
    const v1 = await createArtifact({ name: 'report.md', type: 'report', content: 'version one', companyId: 'c1' });
    const v2 = await createArtifactVersion(v1.id, 'version two');

    expect(v2.version).toBe(2);
    const v2Meta = JSON.parse(v2.metadata);
    expect(v2Meta.previousVersionId).toBe(v1.id);
    expect(v2Meta.previousChecksum).toBe(v1.checksum);
    expect(v2.checksum).toBe(sha256('version two'));

    // v1 is untouched
    const storedV1 = await getArtifact(v1.id);
    expect(storedV1?.content).toBe('version one');
  });

  it('verifyChecksum detects tampering', async () => {
    const artifact = await createArtifact({ name: 'a.txt', type: 'document', content: 'original', companyId: 'c1' });
    expect(verifyChecksum(artifact)).toBe(true);
    expect(verifyChecksum({ ...artifact, content: 'tampered' })).toBe(false);
  });

  it('listArtifacts filters by company and type', async () => {
    await createArtifact({ name: 'a', type: 'report', content: 'aaaa', companyId: 'c1' });
    await createArtifact({ name: 'b', type: 'spreadsheet', content: 'bbbb', companyId: 'c1' });
    await createArtifact({ name: 'c', type: 'report', content: 'cccc', companyId: 'c2' });

    const c1 = await listArtifacts({ companyId: 'c1' });
    expect(c1.total).toBe(2);
    const c1Reports = await listArtifacts({ companyId: 'c1', type: 'report' });
    expect(c1Reports.total).toBe(1);
    expect(c1Reports.artifacts[0].name).toBe('a');
  });

  it('deleteArtifact removes the record', async () => {
    const artifact = await createArtifact({ name: 'a', type: 'report', content: 'aaaa', companyId: 'c1' });
    expect(await deleteArtifact(artifact.id)).toBe(true);
    expect(await getArtifact(artifact.id)).toBeNull();
    expect(await deleteArtifact('missing')).toBe(false);
  });

  it('buildRunReportArtifact assembles a markdown report from run outcomes', async () => {
    const artifact = await buildRunReportArtifact({
      runId: 'run-1',
      objective: 'Research UK universities',
      plan: [
        { title: 'Research', description: 'Find universities', status: 'completed' },
        { title: 'Report', description: 'Write report', status: 'failed' },
      ],
      tasks: [
        { title: 'Research', status: 'completed', agentName: 'Research Agent', model: 'stub-model', tokens: 30, output: 'Found 10 universities.', qcScore: 0.9, qcPassed: true },
        { title: 'Report', status: 'failed', agentName: 'Writer Agent', error: 'Configuration required: no AI provider is configured or reachable.' },
      ],
      summary: 'Completed 1/2 steps; 1 failed. See run report for details.',
      companyId: 'company-1',
      generatedBy: 'master-orchestrator',
    });

    expect(artifact.type).toBe('report');
    expect(artifact.runId).toBe('run-1');
    expect(artifact.content).toContain('# ALO Labs AgentOS — Run Report');
    expect(artifact.content).toContain('Research UK universities');
    expect(artifact.content).toContain('Completed 1/2 steps; 1 failed');
    expect(artifact.content).toContain('Configuration required');
    expect(verifyChecksum(artifact)).toBe(true);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { S3CompatibleClient, s3BackupClientFromEnv } from '@/lib/s3/client';

/**
 * These tests run the real AWS SDK against an in-process S3-compatible
 * endpoint. They verify what actually goes over the wire (path-style URL,
 * SigV4 Authorization header, method, body, query parameters), not a mock of
 * our own wrapper — a SigV4/serialization regression would fail here.
 */

interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

let server: ReturnType<typeof createServer>;
let requests: CapturedRequest[] = [];
let responder: (req: IncomingMessage, res: ServerResponse, body: Buffer) => void;

const BUCKET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>agent-hub</Name>
  <Prefix></Prefix>
  <KeyCount>2</KeyCount>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <Contents>
    <Key>docs/a.txt</Key>
    <LastModified>2026-01-02T03:04:05.000Z</LastModified>
    <ETag>"etag-a"</ETag>
    <Size>12</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>docs/b.txt</Key>
    <LastModified>2026-01-03T00:00:00.000Z</LastModified>
    <ETag>"etag-b"</ETag>
    <Size>34</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
</ListBucketResult>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body,
      });
      responder(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  responder = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end('<ok/>');
  };
});

function client(): S3CompatibleClient {
  const { port } = server.address() as AddressInfo;
  return new S3CompatibleClient({
    endPoint: '127.0.0.1',
    port,
    accessKey: 'test-access-key',
    secretKey: 'test-secret-key',
    useSSL: false,
    region: 'us-east-1',
    bucket: 'agent-hub',
  });
}

describe('S3CompatibleClient — request shape', () => {
  it('uses path-style addressing and SigV4 headers for putObject', async () => {
    responder = (_req, res) => {
      res.writeHead(200);
      res.end();
    };

    await client().putObject('agent-hub', 'docs/report.txt', Buffer.from('hello s3'), 'text/plain', {
      owner: 'agent-42',
    });

    expect(requests).toHaveLength(1);
    const [request] = requests;
    // Path style: /<bucket>/<key> — not bucket.127.0.0.1
    expect(request.method).toBe('PUT');
    // The SDK appends a bookkeeping `x-id=PutObject` query parameter.
    expect(request.url).toMatch(/^\/agent-hub\/docs\/report\.txt(\?|$)/);
    expect(request.body.toString('utf-8')).toBe('hello s3');

    const auth = String(request.headers.authorization);
    expect(auth).toContain('AWS4-HMAC-SHA256 Credential=test-access-key/');
    expect(auth).toContain('/us-east-1/s3/aws4_request');
    expect(auth).toMatch(/SignedHeaders=[^,]*(host|host;)/);
    expect(auth).toContain('Signature=');
    expect(request.headers['x-amz-date']).toBeTruthy();
    expect(request.headers['x-amz-content-sha256']).toBeTruthy();
    expect(String(request.headers['x-amz-meta-owner'])).toBe('agent-42');
  });

  it('lists objects and maps ListObjectsV2 XML into object metadata', async () => {
    responder = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(BUCKET_XML);
    };

    const objects = await client().listObjects('agent-hub', { prefix: 'docs/', maxKeys: 10 });

    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toMatch(/^\/agent-hub\/\?/);
    expect(requests[0].url).toContain('list-type=2');
    expect(requests[0].url).toContain('prefix=docs%2F');

    expect(objects).toEqual([
      { key: 'docs/a.txt', size: 12, lastModified: '2026-01-02T03:04:05.000Z' },
      { key: 'docs/b.txt', size: 34, lastModified: '2026-01-03T00:00:00.000Z' },
    ]);
  });

  it('stops paginating once maxKeys is reached', async () => {
    responder = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.end(BUCKET_XML);
    };

    const objects = await client().listObjects('agent-hub', { maxKeys: 1 });
    expect(objects).toHaveLength(1);
    expect(objects[0].key).toBe('docs/a.txt');
  });

  it('reads an object into a buffer', async () => {
    responder = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '10' });
      res.end('backup-sql');
    };

    const buffer = await client().getObjectBuffer('agent-hub', 'backups/db.sql.gz');
    expect(buffer.toString('utf-8')).toBe('backup-sql');
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toMatch(/^\/agent-hub\/backups\/db\.sql\.gz(\?|$)/);
  });

  it('reports stat metadata from HeadObject', async () => {
    responder = (_req, res) => {
      res.writeHead(200, {
        'Content-Length': '4096',
        'Last-Modified': 'Tue, 06 Jan 2026 10:00:00 GMT',
      });
      res.end();
    };

    const info = await client().statObject('agent-hub', 'backups/db.sql.gz');
    expect(requests[0].method).toBe('HEAD');
    expect(info.size).toBe(4096);
    expect(info.lastModified).toBe('2026-01-06T10:00:00.000Z');
  });

  it('distinguishes a missing bucket (404) from an existing one', async () => {
    responder = (_req, res) => {
      res.writeHead(404);
      res.end();
    };
    await expect(client().bucketExists('agent-hub')).resolves.toBe(false);

    responder = (_req, res) => {
      res.writeHead(200);
      res.end();
    };
    await expect(client().bucketExists('agent-hub')).resolves.toBe(true);
  });

  it('sends DELETE for removeObject', async () => {
    await client().removeObject('agent-hub', 'docs/old.txt');
    expect(requests[0].method).toBe('DELETE');
    expect(requests[0].url).toMatch(/^\/agent-hub\/docs\/old\.txt(\?|$)/);
  });

  it('presigns a GET URL with a signature and expiry, without contacting the server', async () => {
    const before = requests.length;
    const url = await client().presignedGetObject('agent-hub', 'docs/report.txt', 900);

    expect(requests.length).toBe(before);
    expect(url).toContain('/agent-hub/docs/report.txt');
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('X-Amz-Expires=900');
    expect(url).toContain('X-Amz-Credential=test-access-key');
  });
});

describe('s3BackupClientFromEnv', () => {
  it('prefers S3_* and falls back to MINIO_* configuration', () => {
    const previous = { ...process.env };
    try {
      process.env.S3_ACCESS_KEY = 's3-key';
      process.env.MINIO_ACCESS_KEY = 'minio-key';
      expect(s3BackupClientFromEnv().config.accessKey).toBe('s3-key');

      delete process.env.S3_ACCESS_KEY;
      expect(s3BackupClientFromEnv().config.accessKey).toBe('minio-key');
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in previous)) delete process.env[key];
      }
      Object.assign(process.env, previous);
    }
  });
});

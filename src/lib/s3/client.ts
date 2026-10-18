/**
 * S3-compatible object storage client.
 *
 * Backed by the maintained `@aws-sdk/client-s3` (AWS SigV4, path-style
 * addressing for MinIO/Ceph/R2 style endpoints). This replaced the `minio`
 * package, which pinned `stream-json@1.x` and `query-string@7.x` — both
 * unpatched advisory branches — and exposed `Client` only, while the restore
 * route imported a non-existent `MinioClient`.
 *
 * Only the operations this platform actually uses are wrapped. Every method
 * throws on failure; callers decide whether to fall back (the MinIO adapter
 * falls back to local disk, the restore route reports the error).
 */

import {
  S3Client as AwsS3Client,
  ListBucketsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  type CreateBucketCommandInput,
  type BucketLocationConstraint,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

export interface S3Config {
  /** Hostname only — no scheme, no port (mirrors the MinIO `endPoint` shape). */
  endPoint: string;
  port?: number;
  accessKey: string;
  secretKey: string;
  useSSL?: boolean;
  region?: string;
  bucket: string;
}

export interface S3ObjectInfo {
  key: string;
  size: number;
  lastModified: string;
}

export interface S3ListOptions {
  prefix?: string;
  /** Hard cap on returned keys; the listing stops as soon as it is reached. */
  maxKeys?: number;
}

/** True when the endpoint is a bare host and therefore needs path-style URLs. */
export function isPathStyleEndpoint(endPoint: string): boolean {
  if (endPoint === 'localhost' || endPoint === '127.0.0.1' || endPoint === '::1') return true;
  // IPv4 / IPv6 literals cannot be virtual-hosted.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(endPoint)) return true;
  if (endPoint.includes(':')) return true;
  return false;
}

export class S3CompatibleClient {
  readonly config: S3Config;
  private readonly client: AwsS3Client;

  constructor(config: S3Config) {
    if (!config.endPoint) throw new Error('S3 endpoint is not configured');
    this.config = config;

    const host = config.port ? `${config.endPoint}:${config.port}` : config.endPoint;
    const protocol = config.useSSL ? 'https:' : 'http:';

    this.client = new AwsS3Client({
      endpoint: `${protocol}//${host}`,
      region: config.region || 'us-east-1',
      // Mirrors the previous client's behaviour: IP/localhost endpoints use
      // path-style URLs, DNS endpoints use virtual-hosted buckets. Override
      // with S3_FORCE_PATH_STYLE=true when a DNS endpoint needs path style.
      forcePathStyle:
        process.env.S3_FORCE_PATH_STYLE === 'true' || isPathStyleEndpoint(config.endPoint),
      // SigV4 against MinIO: do not let the SDK add checksum trailers that
      // S3-compatible endpoints reject.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials:
        config.accessKey && config.secretKey
          ? { accessKeyId: config.accessKey, secretAccessKey: config.secretKey }
          : undefined,
    });
  }

  /** Returns the bucket names visible to the configured credentials. */
  async listBuckets(): Promise<string[]> {
    const response = await this.client.send(new ListBucketsCommand({}));
    return (response.Buckets ?? [])
      .map((bucket) => bucket.Name)
      .filter((name): name is string => Boolean(name));
  }

  async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (err) {
      const status = httpStatus(err);
      if (status === 404) return false;
      // 403 means the bucket exists but the key may not list it; creating it
      // would fail anyway, so report existence rather than pretend otherwise.
      if (status === 403) return true;
      throw err;
    }
  }

  async makeBucket(bucket: string): Promise<void> {
    const region = this.config.region || 'us-east-1';
    const input: CreateBucketCommandInput = { Bucket: bucket };
    if (region !== 'us-east-1') {
      input.CreateBucketConfiguration = {
        LocationConstraint: region as BucketLocationConstraint,
      };
    }
    await this.client.send(new CreateBucketCommand(input));
  }

  async putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: body.byteLength,
        ContentType: contentType,
        Metadata: metadata,
      }),
    );
  }

  /** Raw response body — a Node Readable stream. */
  async getObjectStream(bucket: string, key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) throw new Error(`S3 object ${bucket}/${key} has no body`);
    return response.Body as unknown as Readable;
  }

  /** Whole object in memory. Used for backup validation (SQL dumps). */
  async getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
    const stream = await this.getObjectStream(bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async statObject(bucket: string, key: string): Promise<S3ObjectInfo> {
    const response = await this.client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      key,
      size: response.ContentLength ?? 0,
      lastModified: response.LastModified?.toISOString() ?? '',
    };
  }

  /** Paginated ListObjectsV2, preserving key order returned by the server. */
  async listObjects(bucket: string, options: S3ListOptions = {}): Promise<S3ObjectInfo[]> {
    const maxKeys = options.maxKeys ?? 1000;
    const objects: S3ObjectInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: options.prefix || undefined,
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of page.Contents ?? []) {
        if (!object.Key) continue;
        objects.push({
          key: object.Key,
          size: object.Size ?? 0,
          lastModified: object.LastModified?.toISOString() ?? '',
        });
        if (objects.length >= maxKeys) return objects;
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    return objects;
  }

  async presignedGetObject(bucket: string, key: string, expiresInSeconds = 3600): Promise<string> {
    // The AWS SDK caps presigned URLs at 7 days.
    const expiresIn = Math.min(Math.max(1, Math.floor(expiresInSeconds)), 604800);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn },
    );
  }

  /** Lightweight connectivity probe: lists buckets and returns latency in ms. */
  async ping(): Promise<number> {
    const started = Date.now();
    await this.listBuckets();
    return Date.now() - started;
  }
}

function httpStatus(err: unknown): number | undefined {
  const metadata = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata;
  return metadata?.httpStatusCode;
}

/** Builds a client from the S3_* backup environment variables. */
export function s3BackupClientFromEnv(): S3CompatibleClient {
  return new S3CompatibleClient({
    endPoint: process.env.S3_ENDPOINT || process.env.MINIO_HOST || 'localhost',
    port: parseInt(process.env.S3_PORT || process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || '',
    useSSL: process.env.S3_USE_SSL === 'true' || process.env.MINIO_SSL === 'true',
    region: process.env.S3_REGION || process.env.MINIO_REGION || 'us-east-1',
    bucket: process.env.S3_BACKUP_BUCKET || process.env.MINIO_BUCKET || 'aios-backups',
  });
}

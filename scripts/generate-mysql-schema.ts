/**
 * Generates prisma/schema.mysql.prisma from prisma/schema.prisma
 * Automatically maps String fields to @db.LongText / @db.Text where appropriate,
 * while preserving VARCHAR(191) for indexed columns, IDs, uniques, foreign keys,
 * and short metadata fields.
 *
 * This ensures 100% MySQL/MariaDB compatibility and eliminates ERROR 1406 (Data too long).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(scriptDirectory, '..', 'prisma', 'schema.prisma');
const mysqlSchemaPath = path.join(scriptDirectory, '..', 'prisma', 'schema.mysql.prisma');

const schema = fs.readFileSync(schemaPath, 'utf8');

// Replace provider = "sqlite" with provider = "mysql"
let mysqlSchema = schema.replace(
  /datasource db \{\s*provider\s*=\s*"sqlite"/,
  'datasource db {\n  provider = "mysql"'
);

// Collect all indexed fields per model
const modelIndices: Record<string, Set<string>> = {};
const modelRegex = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
let match: RegExpExecArray | null;

while ((match = modelRegex.exec(schema)) !== null) {
  const modelName = match[1];
  const body = match[2];
  const indexed = new Set<string>();

  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@@index') || trimmed.startsWith('@@unique')) {
      const fieldMatch = trimmed.match(/\[([^\]]+)\]/);
      if (fieldMatch) {
        fieldMatch[1].split(',').forEach((f) => indexed.add(f.trim()));
      }
    }
  }
  modelIndices[modelName] = indexed;
}

// Fields that should always remain standard VARCHAR
const SHORT_EXACT_NAMES = new Set([
  'id', 'email', 'name', 'slug', 'role', 'status', 'type', 'version',
  'category', 'categorySlug', 'priority', 'severity', 'source', 'ruleId',
  'sopId', 'templateId', 'nodeId', 'edgeId', 'action', 'resource', 'channel',
  'gender', 'currency', 'localCurrency', 'code', 'country', 'city', 'state',
  'phone', 'ip', 'ipAddress', 'sourceIp', 'userAgent', 'format', 'retention', 'runtime',
  'relationType', 'season', 'month', 'accessLevel', 'key', 'companyId',
  'departmentId', 'departmentName', 'userId', 'requestedBy', 'agentId', 'skillId', 'workflowId',
  'taskId', 'commandId', 'managerId', 'fromNodeId', 'toNodeId', 'roleId',
  'permissionId', 'resourceId', 'correlationId', 'agentTypeId', 'subcategory',
  'title', 'host', 'port', 'database', 'user', 'stageId', 'pipelineId', 'contactId',
  'dealId', 'provider', 'model', 'modelId', 'family', 'healthStatus', 'environment',
  'region', 'bucket', 'driver', 'protocol', 'workerId', 'serviceId', 'hostname',
  'address', 'domain', 'ipOrCidr', 'domainName', 'engineType', 'eventType',
  'mimeType', 'extension', 'bucketName', 'storageClass', 'etag', 'checksum',
  'otpSecret', 'passwordHash', 'token', 'refreshToken', 'accessToken',
  'apiName', 'level', 'pricing', 'period', 'authorName', 'syncType',
  'step', 'stepName', 'triggerType', 'safetyLevel', 'learningScope',
  'alertType', 'checkType', 'metric', 'sourceSystem', 'targetSystem', 'entityType',
]);

// Model-scoped short fields (AgentOS hardening, 2026-10-09). These are NEW
// tables/columns only — existing LONGTEXT columns on other models must never be
// narrowed to VARCHAR(191), which could truncate production data.
const MODEL_SHORT_FIELDS: Record<string, Set<string>> = {
  OutputVersion: new Set(['reason', 'model', 'assessmentId']),
  AIProviderConfig: new Set(['lastHealthStatus', 'keyFingerprint', 'createdBy']),
  ModelRoutingDecision: new Set(['requestedModel', 'taskType', 'selectedModel', 'reason', 'fallbackFrom', 'errorCode']),
  BackupRecord: new Set(['kind', 'appVersion', 'commit', 'schemaVersion', 'createdBy']),
  QueueItem: new Set(['lockedBy', 'idempotencyKey']),
  // Client portal separation (2026-11-15) — new column / new tables only.
  Company: new Set(['accountType']),
  ClientAccount: new Set(['accountManagerName', 'accountManagerTitle', 'accountManagerEmail', 'accountManagerPhone', 'billingEmail']),
  ServiceOffering: new Set(['pricingModel', 'billingInterval', 'deliveryTimeframe']),
  ClientProject: new Set(['serviceName']),
  ClientMessage: new Set(['senderType', 'senderName']),
  ClientDocument: new Set(['kind', 'fileName', 'storageKey', 'uploadedByType']),
  ClientActivity: new Set(['actorType']),
  ClientPayment: new Set(['method', 'reference']),
  ClientSupportTicket: new Set(['subject']),
  ClientNotification: new Set(['link']),
  ClientProjectExecution: new Set(['reviewStatus']),
};

const lines = mysqlSchema.split('\n');
const processedLines: string[] = [];

let insideModel = false;
let currentModel = '';

for (const line of lines) {
  const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
  if (modelMatch) {
    insideModel = true;
    currentModel = modelMatch[1];
    processedLines.push(line);
    continue;
  }

  if (insideModel && line.trim() === '}') {
    insideModel = false;
    currentModel = '';
    processedLines.push(line);
    continue;
  }

  if (insideModel) {
    const trimmed = line.trim();
    // Skip empty lines, comments, @@ directives
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
      processedLines.push(line);
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const fieldName = parts[0];
    const fieldType = parts[1];

    if ((fieldType === 'String' || fieldType === 'String?') && !trimmed.includes('@db.')) {
      const isUniqueOrId = trimmed.includes('@id') || trimmed.includes('@unique');
      const isIndexed = modelIndices[currentModel]?.has(fieldName);
      const isIdField = fieldName.endsWith('Id') || fieldName.endsWith('ID');
      const isShort = SHORT_EXACT_NAMES.has(fieldName) || isIdField ||
        (MODEL_SHORT_FIELDS[currentModel]?.has(fieldName) ?? false);

      // If field is used in an index, unique constraint, or is an ID/short string,
      // it MUST remain VARCHAR(191)
      if (isUniqueOrId || isIndexed || (isShort && !trimmed.includes('"[]"') && !trimmed.includes('"{}"'))) {
        processedLines.push(line);
      } else {
        // Needs LongText
        const hasOptional = fieldType === 'String?';
        const typeToken = hasOptional ? 'String?' : 'String';
        const newLine = line.replace(
          new RegExp(`(\\s+${typeToken.replace('?', '\\?')})`),
          `$1 @db.LongText`
        );
        processedLines.push(newLine);
      }
      continue;
    }
  }

  processedLines.push(line);
}

fs.writeFileSync(mysqlSchemaPath, processedLines.join('\n'));
console.log('Successfully generated prisma/schema.mysql.prisma');

// ─── DDL variant for `prisma db push` ───────────────────────────────────────
//
// MySQL 8 refuses a literal DEFAULT on TEXT-family columns ("BLOB, TEXT,
// GEOMETRY or JSON column can't have a default value"), and this schema has
// many `String @db.LongText @default("...")` fields. The canonical schema
// above keeps those defaults — the Prisma client generated from it applies
// them client-side on every `create()` — but a raw `prisma db push` of the
// canonical file cannot succeed.
//
// So we also emit `schema.mysql.push.prisma`: identical to the canonical
// schema except that `@default(...)` is stripped from TEXT-family lines.
// `prisma db push` uses THIS file for DDL only; the client always comes from
// the canonical schema, so runtime defaulting is unchanged. Anyone pushing
// to a real database (CI or production) must push this variant, not the
// canonical schema, or the next push will see drift and try to re-add the
// TEXT defaults.
const pushSchemaPath = path.join(path.dirname(mysqlSchemaPath), 'schema.mysql.push.prisma');
const pushLines = processedLines.map((line) =>
  /@db\.(LongText|MediumText|TinyText|Text)/.test(line)
    ? line.replace(/\s*@default\((?:"[^"]*"|'[^']*'|[^)\s]*)\)/, '')
    : line,
);
fs.writeFileSync(pushSchemaPath, pushLines.join('\n'));
console.log('Successfully generated prisma/schema.mysql.push.prisma (DDL variant without TEXT defaults)');


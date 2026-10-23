/**
 * Comprehensive MySQL Schema & Compatibility Verification
 * ALO Labs AI-EOS
 *
 * Verifies SQLite/MySQL Prisma model and logical field-type parity, MySQL
 * indexed and relation scalar field safety, plus selected @db.LongText fields.
 * This is static only; it does not connect to a live MySQL database.
 */

import fs from 'fs';
import path from 'path';

export interface VerificationResult {
  totalModels: number;
  sqliteModels: number;
  schemaParityErrors: number;
  totalIndexes: number;
  indexCollisions: number;
  relationFieldCollisions: number;
  criticalFieldsVerified: number;
  criticalFieldsPassed: boolean;
  errors: string[];
}

function parseModelFields(content: string): Map<string, Map<string, string>> {
  const models = new Map<string, Map<string, string>>();
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const match of content.matchAll(modelPattern)) {
    const fields = new Map<string, string>();
    for (const line of match[2].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
      const field = trimmed.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_?\[\]]+)/);
      if (field) fields.set(field[1], field[2]);
    }
    models.set(match[1], fields);
  }
  return models;
}

export function verifyCompatibility(sqlitePath?: string): VerificationResult {
  const mysqlSchemaPath = path.join(process.cwd(), 'prisma', 'schema.mysql.prisma');
  const sourceSchemaPath = sqlitePath ?? path.join(process.cwd(), 'prisma', 'schema.prisma');
  if (!fs.existsSync(mysqlSchemaPath)) {
    throw new Error('schema.mysql.prisma not found. Run scripts/generate-mysql-schema.ts first.');
  }
  if (!fs.existsSync(sourceSchemaPath)) throw new Error('schema.prisma not found.');

  const sourceContent = fs.readFileSync(sourceSchemaPath, 'utf8');
  const sourceModels = parseModelFields(sourceContent);
  const content = fs.readFileSync(mysqlSchemaPath, 'utf8');
  const lines = content.split('\n');

  let currentModel = '';
  const modelIndexes = new Map<string, Set<string>>();
  const modelRelationFields = new Map<string, Set<string>>();
  const modelFields = new Map<string, Map<string, string>>();
  const errors: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{$/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      modelIndexes.set(currentModel, new Set());
      modelRelationFields.set(currentModel, new Set());
      modelFields.set(currentModel, new Map());
      continue;
    }

    if (trimmed === '}') {
      currentModel = '';
      continue;
    }

    if (!currentModel) continue;

    // Capture @@index and @@unique
    const indexMatch = trimmed.match(/@@(?:index|unique)\(\[([^\]]+)\]/);
    if (indexMatch) {
      const fieldList = indexMatch[1].split(',').map((f) => f.trim().split(/\s+/)[0]);
      for (const f of fieldList) {
        modelIndexes.get(currentModel)?.add(f);
      }
    }

    const relationMatch = trimmed.match(/@relation\([^)]*fields:\s*\[([^\]]+)\]/);
    if (relationMatch) {
      const relationFields = relationMatch[1].split(',').map((field) => field.trim());
      for (const field of relationFields) {
        modelRelationFields.get(currentModel)?.add(field);
      }
    }

    // Capture fields
    const fieldMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_?\[\]]+)(\s+.*)?$/);
    if (fieldMatch && !trimmed.startsWith('@@')) {
      const fieldName = fieldMatch[1];
      const rest = trimmed;
      if (rest.includes('@unique')) {
        modelIndexes.get(currentModel)?.add(fieldName);
      }
      modelFields.get(currentModel)?.set(fieldName, rest);
    }
  }

  // Verify model/field/type parity before checking MySQL-specific annotations.
  const schemaParityStart = errors.length;
  for (const model of sourceModels.keys()) {
    if (!modelFields.has(model)) errors.push(`MySQL schema is missing model ${model}`);
  }
  for (const [model, sourceFields] of sourceModels.entries()) {
    const mysqlFields = modelFields.get(model);
    if (!mysqlFields) continue;
    for (const [field, sourceType] of sourceFields.entries()) {
      const mysqlDefinition = mysqlFields.get(field);
      if (!mysqlDefinition) {
        errors.push(`MySQL schema is missing field ${model}.${field}`);
        continue;
      }
      const mysqlType = mysqlDefinition.match(/^\w+\s+([a-zA-Z0-9_?\[\]]+)/)?.[1];
      if (mysqlType !== sourceType) {
        errors.push(`Field type mismatch ${model}.${field}: SQLite=${sourceType}, MySQL=${mysqlType ?? 'unparsed'}`);
      }
    }
    for (const field of mysqlFields.keys()) {
      if (!sourceFields.has(field)) errors.push(`MySQL schema has unexpected field ${model}.${field}`);
    }
  }
  for (const model of modelFields.keys()) {
    if (!sourceModels.has(model)) errors.push(`MySQL schema has unexpected model ${model}`);
  }
  const schemaParityErrors = errors.length - schemaParityStart;

  // 1. Verify 0 index collisions on LongText
  let totalIndexes = 0;
  let indexCollisions = 0;

  for (const [model, indexes] of modelIndexes.entries()) {
    const fields = modelFields.get(model);
    for (const idxField of indexes) {
      totalIndexes++;
      const fieldDef = fields?.get(idxField) || '';
      if (fieldDef.includes('@db.LongText')) {
        indexCollisions++;
        errors.push(`Index collision in model ${model}.${idxField}: Indexed field cannot be @db.LongText`);
      }
    }
  }

  // Relation scalar fields become foreign keys and must remain VARCHAR-compatible.
  let relationFieldCollisions = 0;
  for (const [model, relationFields] of modelRelationFields.entries()) {
    const fields = modelFields.get(model);
    for (const relationField of relationFields) {
      const fieldDef = fields?.get(relationField) || '';
      if (fieldDef.includes('@db.LongText')) {
        relationFieldCollisions++;
        errors.push(`Relation field collision in model ${model}.${relationField}: Foreign-key fields cannot be @db.LongText`);
      }
    }
  }

  // 2. Verify critical text fields
  const criticalChecks = [
    { model: 'MarketplaceListing', field: 'description' },
    { model: 'DomainDeployment', field: 'deployLog' },
    { model: 'Skill', field: 'purpose' },
    { model: 'Skill', field: 'content' },
    { model: 'Agent', field: 'purpose' },
    { model: 'Agent', field: 'systemInstructions' },
    { model: 'AgentExecution', field: 'input' },
    { model: 'AgentExecution', field: 'executionOutput' },
    { model: 'AgentRun', field: 'input' },
    { model: 'AgentRun', field: 'output' },
    { model: 'RagChunk', field: 'content' },
    { model: 'PromptTemplate', field: 'systemPrompt' },
    { model: 'PromptTemplate', field: 'userTemplate' },
  ];

  let criticalFieldsVerified = 0;
  let criticalFieldsPassed = true;

  for (const check of criticalChecks) {
    const fieldDef = modelFields.get(check.model)?.get(check.field);
    if (!fieldDef) {
      criticalFieldsPassed = false;
      errors.push(`Critical field ${check.model}.${check.field} is missing`);
      continue;
    }
    criticalFieldsVerified++;
    if (!fieldDef.includes('@db.LongText')) {
      criticalFieldsPassed = false;
      errors.push(`Critical field ${check.model}.${check.field} is NOT @db.LongText`);
    }
  }

  const result: VerificationResult = {
    totalModels: modelFields.size,
    sqliteModels: sourceModels.size,
    schemaParityErrors,
    totalIndexes,
    indexCollisions,
    relationFieldCollisions,
    criticalFieldsVerified,
    criticalFieldsPassed,
    errors,
  };

  console.log('============================================================');
  console.log('MySQL Schema Compatibility Verification');
  console.log('============================================================');
  console.log(`Models (SQLite/MySQL):    ${result.sqliteModels}/${result.totalModels}`);
  console.log(`Schema parity errors:     ${result.schemaParityErrors} (Must be 0)`);
  console.log(`Total Indexed Fields:    ${result.totalIndexes}`);
  console.log(`Index Collisions:        ${result.indexCollisions} (Must be 0)`);
  console.log(`Relation Field Collisions: ${result.relationFieldCollisions} (Must be 0)`);
  console.log(`Critical Fields Checked: ${result.criticalFieldsVerified}`);
  console.log(`Critical Fields Safe:    ${result.criticalFieldsPassed ? 'YES' : 'NO'}`);
  console.log(`Status:                  ${result.errors.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log('============================================================\n');

  return result;
}

if (require.main === module) {
  const res = verifyCompatibility();
  if (res.errors.length > 0) {
    console.error('Compatibility errors found:');
    res.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

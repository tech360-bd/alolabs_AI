/**
 * Comprehensive MySQL Schema & Compatibility Verification
 * ALO Labs AI-EOS
 *
 * Verifies the MySQL Prisma schema's indexed and relation scalar field types,
 * plus selected content fields that must use @db.LongText. This is a static
 * schema check; it does not connect to or inspect a live MySQL database.
 */

import fs from 'fs';
import path from 'path';

export interface VerificationResult {
  totalModels: number;
  totalIndexes: number;
  indexCollisions: number;
  relationFieldCollisions: number;
  criticalFieldsVerified: number;
  criticalFieldsPassed: boolean;
  errors: string[];
}

export function verifyCompatibility(sqlitePath?: string): VerificationResult {
  const mysqlSchemaPath = path.join(process.cwd(), 'prisma', 'schema.mysql.prisma');
  if (!fs.existsSync(mysqlSchemaPath)) {
    throw new Error('schema.mysql.prisma not found. Run scripts/generate-mysql-schema.ts first.');
  }

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
    { model: 'Agent', field: 'systemPrompt' },
    { model: 'RagDocument', field: 'content' },
    { model: 'RagChunk', field: 'content' },
    { model: 'ExecutionLog', field: 'output' },
    { model: 'PromptTemplate', field: 'content' },
  ];

  let criticalFieldsVerified = 0;
  let criticalFieldsPassed = true;

  for (const check of criticalChecks) {
    const fieldDef = modelFields.get(check.model)?.get(check.field);
    if (fieldDef) {
      criticalFieldsVerified++;
      if (!fieldDef.includes('@db.LongText')) {
        criticalFieldsPassed = false;
        errors.push(`Critical field ${check.model}.${check.field} is NOT @db.LongText`);
      }
    }
  }

  const result: VerificationResult = {
    totalModels: modelFields.size,
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
  console.log(`Total Models:            ${result.totalModels}`);
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

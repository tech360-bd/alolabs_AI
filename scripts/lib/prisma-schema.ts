/**
 * Minimal Prisma schema parser shared by the air-gapped tooling
 * (scripts/sqlite-push.ts, scripts/db-integrity-audit.ts).
 *
 * It understands the subset of the Prisma schema language used by
 * prisma/schema.prisma: models, scalar/relation fields, @id/@unique/@default/
 * @updatedAt/@relation attributes and @@index/@@unique blocks.
 */

// ─── Schema parsing ──────────────────────────────────────────────────────────

export const SCALAR_TYPES = new Set([
  'String', 'Int', 'Float', 'Boolean', 'DateTime', 'BigInt', 'Json', 'Bytes', 'Decimal',
]);

export interface ParsedField {
  name: string;
  type: string;
  optional: boolean;
  isList: boolean;
  isScalar: boolean;
  attrs: string; // raw attribute text
  isId: boolean;
  isUnique: boolean;
  isUpdatedAt: boolean;
  defaultRaw: string | null;
  relation: {
    fields: string[];
    references: string[];
    onDelete: string | null;
    onUpdate: string | null;
  } | null;
}

export interface ParsedModel {
  name: string;
  fields: ParsedField[];
  indexes: string[][];
  uniques: string[][];
}

/** Remove // and block comments while respecting string literals. */
function stripComments(text: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Extract the body of a `{ ... }` block starting at the index of `{`. */
function extractBlock(text: string, openBrace: number): { body: string; end: number } {
  let depth = 0;
  for (let i = openBrace; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: text.slice(openBrace + 1, i), end: i };
    }
  }
  throw new Error('Unbalanced braces in schema');
}

function parseAttrArgs(attrText: string, attrName: string): string | null {
  const re = new RegExp(`@${attrName}\\s*\\(`);
  const m = re.exec(attrText);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  let inStr = false;
  const start = i;
  while (i < attrText.length && depth > 0) {
    const ch = attrText[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === '"') inStr = false;
      i += 1;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    i += 1;
  }
  return attrText.slice(start, i - 1);
}

function parseStringList(args: string | null): string[] {
  if (!args) return [];
  // Prisma relation fields are identifiers (`fields: [companyId]`), not
  // quoted strings. The old quoted-only parser silently emitted zero FKs.
  return args.split(',').map((value) => value.trim().replace(/^"|"$/g, '')).filter(Boolean).map((value) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid relation field: ${value}`);
    return value;
  });
}

/** Parse a bracketed field list like `[a, b]` or `["a", "b"]` (block attributes use bare idents). */
function parseFieldList(line: string): string[] {
  const m = /\[([^\]]*)\]/.exec(line);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^"|"$/g, ''));
}

function parseField(line: string, modelNames: Set<string>): ParsedField {
  const m = /^(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$/.exec(line.trim());
  if (!m) throw new Error(`Cannot parse field line: ${line}`);
  const [, name, type, modifier, attrs] = m;
  const field: ParsedField = {
    name,
    type,
    optional: modifier === '?',
    isList: modifier === '[]',
    isScalar: SCALAR_TYPES.has(type),
    attrs,
    isId: /@id\b/.test(attrs),
    isUnique: /@unique\b/.test(attrs),
    isUpdatedAt: /@updatedAt\b/.test(attrs),
    defaultRaw: null,
    relation: null,
  };
  if (!field.isScalar && !modelNames.has(type)) {
    // Unknown type — treat as scalar TEXT to stay permissive.
    field.isScalar = true;
  }
  const defArgs = parseAttrArgs(attrs, 'default');
  if (defArgs !== null) field.defaultRaw = defArgs.trim();
  const relArgs = parseAttrArgs(attrs, 'relation');
  if (relArgs) {
    field.relation = {
      fields: parseStringList(/fields\s*:\s*\[([^\]]*)\]/.exec(relArgs)?.[1] ?? null),
      references: parseStringList(/references\s*:\s*\[([^\]]*)\]/.exec(relArgs)?.[1] ?? null),
      onDelete: /onDelete\s*:\s*(\w+)/.exec(relArgs)?.[1] ?? null,
      onUpdate: /onUpdate\s*:\s*(\w+)/.exec(relArgs)?.[1] ?? null,
    };
  }
  return field;
}

export function parseSchema(schemaText: string): ParsedModel[] {
  const text = stripComments(schemaText);
  const models: ParsedModel[] = [];
  const modelRe = /\bmodel\s+(\w+)\s*\{/g;
  let m: RegExpExecArray | null;
  const names = new Set<string>();
  while ((m = modelRe.exec(text)) !== null) names.add(m[1]);

  modelRe.lastIndex = 0;
  while ((m = modelRe.exec(text)) !== null) {
    const name = m[1];
    const openBrace = m.index + m[0].length - 1;
    const { body } = extractBlock(text, openBrace);
    const model: ParsedModel = { name, fields: [], indexes: [], uniques: [] };
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('@@index')) {
        model.indexes.push(parseFieldList(line));
        continue;
      }
      if (line.startsWith('@@unique')) {
        model.uniques.push(parseFieldList(line));
        continue;
      }
      if (line.startsWith('@@')) continue; // @@id / @@map / @@ignore — not used in this schema
      model.fields.push(parseField(line, names));
    }
    models.push(model);
  }
  return models;
}

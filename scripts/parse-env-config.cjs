'use strict';

/** Find the first unescaped closing quote in a quoted dotenv value. */
function findClosingQuote(value, quote) {
  let precedingBackslashes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === quote && precedingBackslashes % 2 === 0) return index;
    precedingBackslashes = character === '\\' ? precedingBackslashes + 1 : 0;
  }

  return -1;
}

/**
 * Parse the simple KEY=value format used by `.env.config`.
 *
 * Unlike shell sourcing or variable-expansion parsers, this intentionally
 * preserves `$` and `${...}` verbatim. Secrets containing dollar signs must
 * arrive in PM2 exactly as written in the file.
 */
function parseEnvConfig(source) {
  const lines = String(source).split(/\r?\n/);
  /** @type {Record<string, string>} */
  const values = {};

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2] ?? '';
    const quote = rawValue[0];

    if (quote === '"' || quote === "'" || quote === '`') {
      let quotedValue = rawValue.slice(1);
      let closingIndex = findClosingQuote(quotedValue, quote);

      // Support multiline quoted values without evaluating them as JavaScript
      // or shell syntax.
      while (closingIndex === -1 && lineIndex + 1 < lines.length) {
        lineIndex += 1;
        quotedValue += `\n${lines[lineIndex]}`;
        closingIndex = findClosingQuote(quotedValue, quote);
      }

      if (closingIndex === -1) {
        throw new SyntaxError(`Unterminated quoted value for ${key} in .env.config`);
      }

      let value = quotedValue.slice(0, closingIndex);
      if (quote === '"') {
        value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
      }
      values[key] = value;
      continue;
    }

    // Unquoted values end at a whitespace-delimited comment. A literal `#`
    // within a token remains untouched; quote values that need inline spaces.
    values[key] = rawValue.replace(/(^|\s)#.*$/, '').trim();
  }

  return values;
}

module.exports = { parseEnvConfig };

/**
 * Arithmetic evaluator for the `calculate` tool.
 *
 * Hand-written recursive descent: no `eval`, no `Function`. Prompt-injected
 * text cannot reach the runtime, only numbers and + - * / ().
 */

export function evaluateArithmetic(expression: string): number {
  // "1 2" must not silently become 12.
  if (/\d\s+\.?\d/.test(expression)) {
    throw new Error('Numbers must not be separated by whitespace');
  }
  const compact = expression.replace(/\s+/g, '');
  const tokens = compact.match(/\d+(\.\d+)?|[+\-*/()]/g);
  if (!tokens || tokens.join('') !== compact) {
    throw new Error('Expression contains unsupported characters');
  }

  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parseFactor();
      if (op === '/' && rhs === 0) throw new Error('Division by zero');
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseFactor(): number {
    const token = next();
    if (token === undefined) throw new Error('Unexpected end of expression');
    if (token === '(') {
      const value = parseExpression();
      if (next() !== ')') throw new Error('Missing closing parenthesis');
      return value;
    }
    if (token === '-') return -parseFactor();
    if (token === '+') return parseFactor();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error(`Unexpected token "${token}"`);
    return value;
  }

  const result = parseExpression();
  if (index !== tokens.length) throw new Error('Unexpected trailing tokens');
  if (!Number.isFinite(result)) throw new Error('Result is not a finite number');
  return result;
}

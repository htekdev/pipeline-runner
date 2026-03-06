// Recursive descent parser for pipeline expressions
// Tokenizes and parses expression strings into an AST

import type {
  Expression,
  LiteralExpression,
  VariableExpression,
  FunctionCallExpression,
  PropertyAccessExpression,
  IndexAccessExpression,
} from '../types/expressions.js';

// ─── Token types ────────────────────────────────────────────────────────────

export type TokenType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'version'
  | 'identifier'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'dot'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// Namespaces that get special handling in variable expressions
const KNOWN_NAMESPACES = new Set([
  'variables',
  'parameters',
  'dependencies',
  'stageDependencies',
  'pipeline',
  'env',
  'strategy',
  'matrix',
  'job',
  'steps',
  'runner',
]);

// ─── Tokenizer ──────────────────────────────────────────────────────────────

export class ExpressionTokenizer {
  private pos = 0;
  private tokens: Token[] = [];
  private readonly input: string;

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    this.pos = 0;
    this.tokens = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      const ch = this.input[this.pos];

      if (ch === "'") {
        this.readString();
      } else if (ch === '(') {
        this.tokens.push({ type: 'lparen', value: '(', position: this.pos });
        this.pos++;
      } else if (ch === ')') {
        this.tokens.push({ type: 'rparen', value: ')', position: this.pos });
        this.pos++;
      } else if (ch === '[') {
        this.tokens.push({ type: 'lbracket', value: '[', position: this.pos });
        this.pos++;
      } else if (ch === ']') {
        this.tokens.push({ type: 'rbracket', value: ']', position: this.pos });
        this.pos++;
      } else if (ch === ',') {
        this.tokens.push({ type: 'comma', value: ',', position: this.pos });
        this.pos++;
      } else if (ch === '.') {
        this.tokens.push({ type: 'dot', value: '.', position: this.pos });
        this.pos++;
      } else if (ch === '-' && this.pos + 1 < this.input.length && isDigit(this.input[this.pos + 1])) {
        this.readNumber();
      } else if (isDigit(ch)) {
        this.readNumber();
      } else if (isIdentStart(ch)) {
        this.readIdentifierOrKeyword();
      } else {
        throw new ExpressionParseError(
          `Unexpected character '${ch}' at position ${this.pos}`,
          this.pos,
        );
      }
    }

    this.tokens.push({ type: 'eof', value: '', position: this.pos });
    return this.tokens;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private readString(): void {
    const start = this.pos;
    this.pos++; // skip opening quote
    let value = '';

    while (this.pos < this.input.length) {
      if (this.input[this.pos] === "'") {
        // Check for escaped quote ('')
        if (this.pos + 1 < this.input.length && this.input[this.pos + 1] === "'") {
          value += "'";
          this.pos += 2;
        } else {
          this.pos++; // skip closing quote
          this.tokens.push({ type: 'string', value, position: start });
          return;
        }
      } else {
        value += this.input[this.pos];
        this.pos++;
      }
    }

    throw new ExpressionParseError(
      `Unterminated string literal starting at position ${start}`,
      start,
    );
  }

  private readNumber(): void {
    const start = this.pos;
    let numStr = '';

    // Handle negative sign
    if (this.input[this.pos] === '-') {
      numStr += '-';
      this.pos++;
    }

    // Read the first group of digits
    numStr += this.readDigits();

    // Check if this could be a version literal (3+ dot-separated digit groups)
    // We need to look ahead without consuming
    if (this.pos < this.input.length && this.input[this.pos] === '.') {
      const lookAhead = this.peekVersionOrFloat(numStr);
      if (lookAhead.isVersion) {
        this.pos = lookAhead.endPos;
        this.tokens.push({ type: 'version', value: lookAhead.value, position: start });
        return;
      }

      // Check for float (number.digits, but NOT number.number.number)
      if (lookAhead.isFloat) {
        this.pos = lookAhead.endPos;
        this.tokens.push({ type: 'number', value: lookAhead.value, position: start });
        return;
      }
    }

    // Plain integer
    this.tokens.push({ type: 'number', value: numStr, position: start });
  }

  private peekVersionOrFloat(firstGroup: string): {
    isVersion: boolean;
    isFloat: boolean;
    value: string;
    endPos: number;
  } {
    let peekPos = this.pos;
    let value = firstGroup;
    let dotCount = 0;

    while (peekPos < this.input.length && this.input[peekPos] === '.') {
      const nextPos = peekPos + 1;
      if (nextPos >= this.input.length || !isDigit(this.input[nextPos])) {
        break;
      }

      // Read the dot and subsequent digits
      value += '.';
      peekPos = nextPos;
      while (peekPos < this.input.length && isDigit(this.input[peekPos])) {
        value += this.input[peekPos];
        peekPos++;
      }
      dotCount++;
    }

    return {
      isVersion: dotCount >= 2, // 3+ groups = version (e.g., 1.2.3)
      isFloat: dotCount === 1,  // exactly 2 groups = float (e.g., 1.5)
      value,
      endPos: peekPos,
    };
  }

  private readDigits(): string {
    let digits = '';
    while (this.pos < this.input.length && isDigit(this.input[this.pos])) {
      digits += this.input[this.pos];
      this.pos++;
    }
    return digits;
  }

  private readIdentifierOrKeyword(): void {
    const start = this.pos;
    let name = '';

    while (this.pos < this.input.length && isIdentChar(this.input[this.pos])) {
      name += this.input[this.pos];
      this.pos++;
    }

    // Check for boolean and null keywords
    const lower = name.toLowerCase();
    if (lower === 'true' || lower === 'false') {
      this.tokens.push({ type: 'boolean', value: lower, position: start });
    } else if (lower === 'null') {
      this.tokens.push({ type: 'null', value: 'null', position: start });
    } else {
      this.tokens.push({ type: 'identifier', value: name, position: start });
    }
  }
}

// ─── Parser ─────────────────────────────────────────────────────────────────

export class ExpressionParser {
  private tokens: Token[] = [];
  private pos = 0;

  constructor(private readonly input: string) {}

  parse(): Expression {
    const tokenizer = new ExpressionTokenizer(this.input);
    this.tokens = tokenizer.tokenize();
    this.pos = 0;

    if (this.current().type === 'eof') {
      // Empty expression → empty string literal
      return { type: 'literal', value: '', dataType: 'string' } satisfies LiteralExpression;
    }

    const expr = this.parseExpression();

    if (this.current().type !== 'eof') {
      throw new ExpressionParseError(
        `Unexpected token '${this.current().value}' at position ${this.current().position}`,
        this.current().position,
      );
    }

    return expr;
  }

  private parseExpression(): Expression {
    let expr = this.parsePrimary();
    expr = this.parsePostfix(expr);
    return expr;
  }

  private parsePrimary(): Expression {
    const token = this.current();

    switch (token.type) {
      case 'string':
        this.advance();
        return {
          type: 'literal',
          value: token.value,
          dataType: 'string',
        } satisfies LiteralExpression;

      case 'number':
        this.advance();
        return {
          type: 'literal',
          value: parseFloat(token.value),
          dataType: 'number',
        } satisfies LiteralExpression;

      case 'version':
        this.advance();
        return {
          type: 'literal',
          value: token.value,
          dataType: 'version',
        } satisfies LiteralExpression;

      case 'boolean':
        this.advance();
        return {
          type: 'literal',
          value: token.value === 'true',
          dataType: 'boolean',
        } satisfies LiteralExpression;

      case 'null':
        this.advance();
        return {
          type: 'literal',
          value: null,
          dataType: 'null',
        } satisfies LiteralExpression;

      case 'identifier':
        return this.parseIdentifierOrFunctionCall();

      case 'lparen': {
        this.advance(); // consume '('
        const inner = this.parseExpression();
        this.expect('rparen');
        return inner;
      }

      default:
        throw new ExpressionParseError(
          `Unexpected token '${token.value}' (${token.type}) at position ${token.position}`,
          token.position,
        );
    }
  }

  private parseIdentifierOrFunctionCall(): Expression {
    const nameToken = this.current();
    this.advance();

    // Check if this is a function call: identifier followed by '('
    if (this.current().type === 'lparen') {
      return this.parseFunctionCall(nameToken.value);
    }

    // Check if followed by '.' and this identifier is a known namespace
    if (
      this.current().type === 'dot' &&
      KNOWN_NAMESPACES.has(nameToken.value)
    ) {
      this.advance(); // consume '.'

      if (this.current().type === 'identifier') {
        const propToken = this.current();
        this.advance();
        return {
          type: 'variable',
          name: propToken.value,
          namespace: nameToken.value,
        } satisfies VariableExpression;
      }

      // Dot but no identifier after it — treat namespace as variable, push dot back
      this.pos--;
      return {
        type: 'variable',
        name: nameToken.value,
      } satisfies VariableExpression;
    }

    // Plain variable
    return {
      type: 'variable',
      name: nameToken.value,
    } satisfies VariableExpression;
  }

  private parseFunctionCall(name: string): FunctionCallExpression {
    this.advance(); // consume '('
    const args: Expression[] = [];

    if (this.current().type !== 'rparen') {
      args.push(this.parseExpression());

      while (this.current().type === 'comma') {
        this.advance(); // consume ','
        args.push(this.parseExpression());
      }
    }

    this.expect('rparen');

    return {
      type: 'function',
      name,
      args,
    } satisfies FunctionCallExpression;
  }

  private parsePostfix(expr: Expression): Expression {
    let result = expr;

    while (true) {
      if (this.current().type === 'dot') {
        this.advance(); // consume '.'

        if (this.current().type !== 'identifier') {
          throw new ExpressionParseError(
            `Expected property name after '.' at position ${this.current().position}`,
            this.current().position,
          );
        }

        const propToken = this.current();
        this.advance();

        result = {
          type: 'propertyAccess',
          object: result,
          property: propToken.value,
        } satisfies PropertyAccessExpression;
      } else if (this.current().type === 'lbracket') {
        this.advance(); // consume '['
        const indexExpr = this.parseExpression();
        this.expect('rbracket');

        result = {
          type: 'indexAccess',
          object: result,
          index: indexExpr,
        } satisfies IndexAccessExpression;
      } else {
        break;
      }
    }

    return result;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new ExpressionParseError(
        `Expected '${type}' but got '${token.type}' ('${token.value}') at position ${token.position}`,
        token.position,
      );
    }
    this.advance();
    return token;
  }
}

// ─── Error type ─────────────────────────────────────────────────────────────

export class ExpressionParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(message);
    this.name = 'ExpressionParseError';
  }
}

// ─── Helper functions ───────────────────────────────────────────────────────

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentChar(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse an expression string into an Expression AST.
 */
export function parseExpression(input: string): Expression {
  const parser = new ExpressionParser(input);
  return parser.parse();
}

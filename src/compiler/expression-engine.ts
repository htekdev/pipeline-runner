// Expression engine — evaluates ${{ }}, $[ ], and $(var) expressions

import type {
  Expression,
  ExpressionContext,
  ExpressionResult,
} from '../types/expressions.js';
import { parseExpression, ExpressionParseError } from './expression-parser.js';
import { expandMacros } from '../variables/macro-expander.js';

// ─── Function registry types ────────────────────────────────────────────────

export type ExpressionFunction = (...args: ExpressionResult[]) => ExpressionResult;
export type FunctionRegistry = Map<string, ExpressionFunction>;

// ─── Expression engine interface ────────────────────────────────────────────

export interface ExpressionEngine {
  /** Process all ${{ }} expressions in a string, returning the resolved value */
  evaluateCompileTime(input: string, context: ExpressionContext): ExpressionResult;

  /** Process all $[ ] expressions in a string, returning the resolved value */
  evaluateRuntime(input: string, context: ExpressionContext): ExpressionResult;

  /** Expand $(var) macros in a string */
  expandMacros(input: string, variables: Record<string, string>): string;

  /** Process a full object tree, expanding all expressions at the appropriate time */
  processObject(obj: unknown, context: ExpressionContext, mode: 'compile' | 'runtime'): unknown;
}

// ─── Regex patterns ─────────────────────────────────────────────────────────

// Match ${{ expression }} — compile-time
const COMPILE_TIME_PATTERN = /\$\{\{(.*?)\}\}/gs;

// Match $[ expression ] — runtime (balanced brackets for nested access)
// The regex approach doesn't handle nested brackets (e.g. outputs['key']),
// so evaluateRuntime uses findRuntimeExpressions() instead.
const RUNTIME_PATTERN = /\$\[(.*?)\]/gs;

/**
 * Find $[...] runtime expressions with balanced bracket matching.
 * Handles nested brackets like $[dependencies.Job.outputs['step.var']].
 */
function findRuntimeExpressions(
  input: string,
): { start: number; end: number; body: string }[] {
  const results: { start: number; end: number; body: string }[] = [];
  let i = 0;
  while (i < input.length - 1) {
    if (input[i] === '$' && input[i + 1] === '[') {
      let depth = 1;
      let j = i + 2;
      let inString = false;
      let stringChar = '';

      while (j < input.length && depth > 0) {
        const ch = input[j];
        if (inString) {
          if (ch === stringChar) inString = false;
        } else {
          if (ch === "'" || ch === '"') {
            inString = true;
            stringChar = ch;
          } else if (ch === '[') {
            depth++;
          } else if (ch === ']') {
            depth--;
          }
        }
        j++;
      }

      if (depth === 0) {
        results.push({
          start: i,
          end: j,
          body: input.substring(i + 2, j - 1),
        });
        i = j;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  return results;
}

/**
 * Process runtime expressions using balanced bracket matching.
 * Unlike processExpressionPattern which uses regex, this handles
 * nested bracket access in expressions like outputs['step.var'].
 */
function processRuntimeExpressions(
  input: string,
  evaluator: ExpressionEvaluator,
  context: ExpressionContext,
): ExpressionResult {
  const expressions = findRuntimeExpressions(input);
  if (expressions.length === 0) return input;

  // Single expression covering entire input — return native type
  if (
    expressions.length === 1 &&
    expressions[0].start === 0 &&
    expressions[0].end === input.length
  ) {
    const body = expressions[0].body.trim();
    if (body.length === 0) return '';
    const ast = parseExpression(body);
    return evaluator.evaluate(ast, context);
  }

  // Multiple expressions or mixed string — interpolate as string
  let result = '';
  let lastEnd = 0;
  for (const expr of expressions) {
    result += input.substring(lastEnd, expr.start);
    const body = expr.body.trim();
    if (body.length === 0) {
      result += '';
    } else {
      const ast = parseExpression(body);
      const value = evaluator.evaluate(ast, context);
      result += coerceToString(value);
    }
    lastEnd = expr.end;
  }
  result += input.substring(lastEnd);
  return result;
}

// ─── Expression evaluator ───────────────────────────────────────────────────

export class ExpressionEvaluator {
  constructor(private readonly functions: FunctionRegistry) {}

  evaluate(ast: Expression, context: ExpressionContext): ExpressionResult {
    switch (ast.type) {
      case 'literal':
        return ast.value;

      case 'variable':
        return this.resolveVariable(ast.name, ast.namespace, context);

      case 'function':
        return this.callFunction(ast.name, ast.args, context);

      case 'propertyAccess':
        return this.resolvePropertyAccess(ast.object, ast.property, context);

      case 'indexAccess':
        return this.resolveIndexAccess(ast.object, ast.index, context);
    }
  }

  private resolveVariable(
    name: string,
    namespace: string | undefined,
    context: ExpressionContext,
  ): ExpressionResult {
    if (!namespace) {
      // Look up in all namespaces — variables first, then parameters, then pipeline
      if (name in context.variables) return context.variables[name];
      if (name in context.parameters) return context.parameters[name] as ExpressionResult;
      if (name in context.dependencies) return context.dependencies[name] as unknown as ExpressionResult;
      if (name in context.pipeline) return context.pipeline[name];
      return '';
    }

    switch (namespace) {
      case 'variables':
        return name in context.variables ? context.variables[name] : '';

      case 'parameters':
        return name in context.parameters
          ? (context.parameters[name] as ExpressionResult)
          : '';

      case 'dependencies':
        return name in context.dependencies
          ? (context.dependencies[name] as unknown as ExpressionResult)
          : '';

      case 'stageDependencies':
        return name in context.dependencies
          ? (context.dependencies[name] as unknown as ExpressionResult)
          : '';

      case 'pipeline':
        return name in context.pipeline ? context.pipeline[name] : '';

      default: {
        // For unknown namespaces, try to find a top-level context key
        const nsContext = context as unknown as Record<string, unknown>;
        if (namespace in nsContext) {
          const nsValue = nsContext[namespace];
          if (nsValue !== null && typeof nsValue === 'object' && name in (nsValue as Record<string, unknown>)) {
            return (nsValue as Record<string, unknown>)[name] as ExpressionResult;
          }
        }
        return '';
      }
    }
  }

  private callFunction(
    name: string,
    argExprs: Expression[],
    context: ExpressionContext,
  ): ExpressionResult {
    const fn = this.functions.get(name.toLowerCase());
    if (!fn) {
      throw new ExpressionEvaluationError(
        `Unknown function '${name}'`,
      );
    }

    const evaluatedArgs = argExprs.map((arg) => this.evaluate(arg, context));
    return fn(...evaluatedArgs);
  }

  private resolvePropertyAccess(
    objectExpr: Expression,
    property: string,
    context: ExpressionContext,
  ): ExpressionResult {
    const obj = this.evaluate(objectExpr, context);
    return navigateProperty(obj, property);
  }

  private resolveIndexAccess(
    objectExpr: Expression,
    indexExpr: Expression,
    context: ExpressionContext,
  ): ExpressionResult {
    const obj = this.evaluate(objectExpr, context);
    const index = this.evaluate(indexExpr, context);
    return navigateIndex(obj, index);
  }
}

// ─── Navigation helpers ─────────────────────────────────────────────────────

function navigateProperty(obj: ExpressionResult, property: string): ExpressionResult {
  if (obj === null || obj === undefined) return '';

  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    if (property in record) {
      return record[property] as ExpressionResult;
    }
    return '';
  }

  return '';
}

function navigateIndex(obj: ExpressionResult, index: ExpressionResult): ExpressionResult {
  if (obj === null || obj === undefined) return '';

  if (Array.isArray(obj)) {
    if (typeof index === 'number') {
      const val = obj[index];
      return val !== undefined ? (val as ExpressionResult) : '';
    }
    return '';
  }

  if (typeof obj === 'object') {
    const key = coerceToString(index);
    const record = obj as Record<string, unknown>;
    if (key in record) {
      return record[key] as ExpressionResult;
    }
    return '';
  }

  return '';
}

// ─── String coercion ────────────────────────────────────────────────────────

function coerceToString(value: ExpressionResult): string {
  if (value === null) return '';
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ─── Pattern processing ─────────────────────────────────────────────────────

function processExpressionPattern(
  input: string,
  pattern: RegExp,
  evaluator: ExpressionEvaluator,
  context: ExpressionContext,
): ExpressionResult {
  // Reset lastIndex for global regex
  pattern.lastIndex = 0;

  // Check if the entire string is a single expression
  const singleMatch = isSingleExpression(input, pattern);
  if (singleMatch !== null) {
    const body = singleMatch.trim();
    if (body.length === 0) return '';
    const ast = parseExpression(body);
    return evaluator.evaluate(ast, context);
  }

  // Multiple expressions or mixed string — interpolate
  pattern.lastIndex = 0;
  let hasMatch = false;
  const result = input.replace(pattern, (_match, body: string) => {
    hasMatch = true;
    const trimmed = body.trim();
    if (trimmed.length === 0) return '';
    const ast = parseExpression(trimmed);
    const value = evaluator.evaluate(ast, context);
    return coerceToString(value);
  });

  return hasMatch ? result : input;
}

/**
 * Check if the entire string is exactly one expression (no surrounding text).
 * Returns the expression body if it is, or null otherwise.
 */
function isSingleExpression(input: string, pattern: RegExp): string | null {
  pattern.lastIndex = 0;
  const match = pattern.exec(input);
  if (!match) return null;

  // Check that the match covers the entire string
  if (match.index === 0 && match[0].length === input.length) {
    return match[1];
  }

  return null;
}

// ─── Engine implementation ──────────────────────────────────────────────────

class ExpressionEngineImpl implements ExpressionEngine {
  private readonly evaluator: ExpressionEvaluator;

  constructor(functions: FunctionRegistry) {
    this.evaluator = new ExpressionEvaluator(functions);
  }

  evaluateCompileTime(input: string, context: ExpressionContext): ExpressionResult {
    if (typeof input !== 'string') return input;
    return processExpressionPattern(
      input,
      new RegExp(COMPILE_TIME_PATTERN.source, 'gs'),
      this.evaluator,
      context,
    );
  }

  evaluateRuntime(input: string, context: ExpressionContext): ExpressionResult {
    if (typeof input !== 'string') return input;
    return processRuntimeExpressions(input, this.evaluator, context);
  }

  expandMacros(input: string, variables: Record<string, string>): string {
    return expandMacros(input, variables);
  }

  processObject(
    obj: unknown,
    context: ExpressionContext,
    mode: 'compile' | 'runtime',
  ): unknown {
    return this.processValue(obj, context, mode);
  }

  private processValue(
    value: unknown,
    context: ExpressionContext,
    mode: 'compile' | 'runtime',
  ): unknown {
    if (typeof value === 'string') {
      const evaluate =
        mode === 'compile'
          ? (s: string) => this.evaluateCompileTime(s, context)
          : (s: string) => this.evaluateRuntime(s, context);
      return evaluate(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.processValue(item, context, mode));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const processedKey = typeof key === 'string'
          ? coerceToString(this.processValue(key, context, mode) as ExpressionResult)
          : key;
        result[processedKey] = this.processValue(val, context, mode);
      }
      return result;
    }

    // Primitives (number, boolean, null, undefined) pass through
    return value;
  }
}

// ─── Error type ─────────────────────────────────────────────────────────────

export class ExpressionEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionEvaluationError';
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create an expression engine with the given function registry.
 */
export function createExpressionEngine(functions: FunctionRegistry): ExpressionEngine {
  return new ExpressionEngineImpl(functions);
}

// Re-export parse error for consumers
export { ExpressionParseError } from './expression-parser.js';

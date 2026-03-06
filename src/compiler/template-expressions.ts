// Template expression processor — handles ${{ if }}, ${{ elseif }}, ${{ else }}, ${{ each }} directives
// These are compile-time directives processed during template expansion.

import type { ExpressionContext, ExpressionResult } from '../types/expressions.js';
import type { ExpressionEngine } from './expression-engine.js';
import { isTruthy } from '../functions/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateExpansionContext {
  parameters: Record<string, unknown>;
  variables: Record<string, string>;
  expressionContext: ExpressionContext;
}

export interface TemplateExpressionProcessor {
  processArray(items: unknown[], context: TemplateExpansionContext): unknown[];
  processObject(
    obj: Record<string, unknown>,
    context: TemplateExpansionContext,
  ): Record<string, unknown> | null;
  processValue(value: unknown, context: TemplateExpansionContext): unknown;
}

// ─── Directive detection ────────────────────────────────────────────────────

const IF_PATTERN = /^\$\{\{\s*if\s+(.+?)\s*\}\}$/;
const ELSEIF_PATTERN = /^\$\{\{\s*elseif\s+(.+?)\s*\}\}$/;
const ELSE_PATTERN = /^\$\{\{\s*else\s*\}\}$/;
const EACH_PATTERN = /^\$\{\{\s*each\s+(\w+)\s+in\s+(.+?)\s*\}\}$/;

interface DirectiveInfo {
  type: 'if' | 'elseif' | 'else' | 'each';
  condition?: string;
  variable?: string;
  collection?: string;
  body: unknown[];
}

/**
 * Check if an array item is a directive (single-key object with a directive key).
 * Returns the parsed directive info, or null if not a directive.
 */
function detectArrayDirective(item: unknown): DirectiveInfo | null {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;

  const entries = Object.entries(item as Record<string, unknown>);
  if (entries.length !== 1) return null;

  const [key, value] = entries[0];
  return parseDirectiveKey(key, value);
}

/**
 * Parse a YAML key to see if it's a directive expression.
 * Returns directive info with body from the value, or null.
 */
function parseDirectiveKey(
  key: string,
  value: unknown,
): DirectiveInfo | null {
  const ifMatch = IF_PATTERN.exec(key);
  if (ifMatch) {
    return { type: 'if', condition: ifMatch[1], body: ensureArray(value) };
  }

  const elseifMatch = ELSEIF_PATTERN.exec(key);
  if (elseifMatch) {
    return {
      type: 'elseif',
      condition: elseifMatch[1],
      body: ensureArray(value),
    };
  }

  if (ELSE_PATTERN.test(key)) {
    return { type: 'else', body: ensureArray(value) };
  }

  const eachMatch = EACH_PATTERN.exec(key);
  if (eachMatch) {
    return {
      type: 'each',
      variable: eachMatch[1],
      collection: eachMatch[2],
      body: ensureArray(value),
    };
  }

  return null;
}

/**
 * Check if a string matches any directive pattern (for object key detection).
 */
function isDirectiveKey(key: string): boolean {
  return (
    IF_PATTERN.test(key) ||
    ELSEIF_PATTERN.test(key) ||
    ELSE_PATTERN.test(key) ||
    EACH_PATTERN.test(key)
  );
}

function ensureArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

// ─── Context helpers ────────────────────────────────────────────────────────

/**
 * Evaluate an expression body (without the ${{ }} wrapper) using the expression engine.
 */
function evaluateExpressionBody(
  engine: ExpressionEngine,
  exprBody: string,
  context: ExpressionContext,
): ExpressionResult {
  return engine.evaluateCompileTime(`\${{ ${exprBody} }}`, context);
}

/**
 * Clone a TemplateExpansionContext with an additional loop variable injected
 * into the parameters namespace.
 */
function cloneContextWithLoopVar(
  context: TemplateExpansionContext,
  varName: string,
  value: unknown,
): TemplateExpansionContext {
  const newParams = { ...context.parameters, [varName]: value };
  return {
    parameters: newParams,
    variables: context.variables,
    expressionContext: {
      ...context.expressionContext,
      parameters: {
        ...context.expressionContext.parameters,
        [varName]: value,
      },
    },
  };
}

/**
 * Coerce an ExpressionResult to a string for use as an object key.
 */
function resultToString(value: ExpressionResult): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return JSON.stringify(value);
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createTemplateExpressionProcessor(
  expressionEngine: ExpressionEngine,
): TemplateExpressionProcessor {
  const processor: TemplateExpressionProcessor = {
    processArray(
      items: unknown[],
      context: TemplateExpansionContext,
    ): unknown[] {
      const result: unknown[] = [];
      // Track if-chain state: null means no active chain, boolean tracks whether any branch matched
      let ifChainMatched: boolean | null = null;

      for (const item of items) {
        const directive = detectArrayDirective(item);

        if (directive) {
          switch (directive.type) {
            case 'if': {
              const condResult = evaluateExpressionBody(
                expressionEngine,
                directive.condition!,
                context.expressionContext,
              );
              const matched = isTruthy(condResult);
              ifChainMatched = matched;
              if (matched) {
                const expanded = processor.processArray(
                  directive.body,
                  context,
                );
                result.push(...expanded);
              }
              break;
            }

            case 'elseif': {
              if (ifChainMatched === null) {
                throw new TemplateExpressionError(
                  '${{ elseif }} without preceding ${{ if }}',
                );
              }
              if (!ifChainMatched) {
                const condResult = evaluateExpressionBody(
                  expressionEngine,
                  directive.condition!,
                  context.expressionContext,
                );
                const matched = isTruthy(condResult);
                if (matched) {
                  ifChainMatched = true;
                  const expanded = processor.processArray(
                    directive.body,
                    context,
                  );
                  result.push(...expanded);
                }
              }
              break;
            }

            case 'else': {
              if (ifChainMatched === null) {
                throw new TemplateExpressionError(
                  '${{ else }} without preceding ${{ if }}',
                );
              }
              if (!ifChainMatched) {
                const expanded = processor.processArray(
                  directive.body,
                  context,
                );
                result.push(...expanded);
              }
              // else always terminates the if-chain
              ifChainMatched = null;
              break;
            }

            case 'each': {
              // each directive breaks any active if-chain
              ifChainMatched = null;

              const collection = evaluateExpressionBody(
                expressionEngine,
                directive.collection!,
                context.expressionContext,
              );

              if (Array.isArray(collection)) {
                for (const elem of collection) {
                  const loopCtx = cloneContextWithLoopVar(
                    context,
                    directive.variable!,
                    elem,
                  );
                  const expanded = processor.processArray(
                    directive.body,
                    loopCtx,
                  );
                  result.push(...expanded);
                }
              } else if (
                collection !== null &&
                typeof collection === 'object' &&
                !Array.isArray(collection)
              ) {
                // Object iteration — each iteration yields { key, value }
                for (const [key, value] of Object.entries(
                  collection as Record<string, unknown>,
                )) {
                  const pair = { key, value };
                  const loopCtx = cloneContextWithLoopVar(
                    context,
                    directive.variable!,
                    pair,
                  );
                  const expanded = processor.processArray(
                    directive.body,
                    loopCtx,
                  );
                  result.push(...expanded);
                }
              }
              // If collection is not iterable (string, number, etc.), skip silently
              break;
            }
          }
        } else {
          // Non-directive item breaks any active if-chain
          ifChainMatched = null;
          result.push(processor.processValue(item, context));
        }
      }

      return result;
    },

    processObject(
      obj: Record<string, unknown>,
      context: TemplateExpansionContext,
    ): Record<string, unknown> | null {
      const result: Record<string, unknown> = {};
      let ifChainMatched: boolean | null = null;
      let hadDirectives = false;
      let hadNonDirectives = false;

      for (const [key, value] of Object.entries(obj)) {
        if (isDirectiveKey(key)) {
          hadDirectives = true;
          const directive = parseDirectiveKey(key, value);
          if (!directive) continue;

          switch (directive.type) {
            case 'if': {
              const condResult = evaluateExpressionBody(
                expressionEngine,
                directive.condition!,
                context.expressionContext,
              );
              const matched = isTruthy(condResult);
              ifChainMatched = matched;
              if (matched) {
                mergeDirectiveValueIntoObject(result, value, context, processor);
              }
              break;
            }

            case 'elseif': {
              if (ifChainMatched === null) {
                throw new TemplateExpressionError(
                  '${{ elseif }} without preceding ${{ if }}',
                );
              }
              if (!ifChainMatched) {
                const condResult = evaluateExpressionBody(
                  expressionEngine,
                  directive.condition!,
                  context.expressionContext,
                );
                if (isTruthy(condResult)) {
                  ifChainMatched = true;
                  mergeDirectiveValueIntoObject(result, value, context, processor);
                }
              }
              break;
            }

            case 'else': {
              if (ifChainMatched === null) {
                throw new TemplateExpressionError(
                  '${{ else }} without preceding ${{ if }}',
                );
              }
              if (!ifChainMatched) {
                mergeDirectiveValueIntoObject(result, value, context, processor);
              }
              ifChainMatched = null;
              break;
            }

            case 'each': {
              ifChainMatched = null;
              const collection = evaluateExpressionBody(
                expressionEngine,
                directive.collection!,
                context.expressionContext,
              );

              if (Array.isArray(collection)) {
                for (const elem of collection) {
                  const loopCtx = cloneContextWithLoopVar(
                    context,
                    directive.variable!,
                    elem,
                  );
                  mergeDirectiveValueIntoObject(result, value, loopCtx, processor);
                }
              } else if (
                collection !== null &&
                typeof collection === 'object'
              ) {
                for (const [k, v] of Object.entries(
                  collection as Record<string, unknown>,
                )) {
                  const pair = { key: k, value: v };
                  const loopCtx = cloneContextWithLoopVar(
                    context,
                    directive.variable!,
                    pair,
                  );
                  mergeDirectiveValueIntoObject(result, value, loopCtx, processor);
                }
              }
              break;
            }
          }
        } else {
          // Regular key — process both key (for expression interpolation) and value
          hadNonDirectives = true;
          ifChainMatched = null;

          const processedKey = resultToString(
            expressionEngine.evaluateCompileTime(key, context.expressionContext),
          );
          result[processedKey] = processor.processValue(value, context);
        }
      }

      // Return null if the object had only directives and none produced content
      if (hadDirectives && !hadNonDirectives && Object.keys(result).length === 0) {
        return null;
      }

      return result;
    },

    processValue(
      value: unknown,
      context: TemplateExpansionContext,
    ): unknown {
      if (value === null || value === undefined) return value;

      if (typeof value === 'string') {
        return expressionEngine.evaluateCompileTime(
          value,
          context.expressionContext,
        );
      }

      if (Array.isArray(value)) {
        return processor.processArray(value, context);
      }

      if (typeof value === 'object') {
        return processor.processObject(
          value as Record<string, unknown>,
          context,
        );
      }

      // Primitives (number, boolean) pass through
      return value;
    },
  };

  return processor;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Process a directive's value and merge its result into the target object.
 * In object context, a directive's value is expected to be an object whose
 * properties get merged into the parent.
 */
function mergeDirectiveValueIntoObject(
  target: Record<string, unknown>,
  value: unknown,
  context: TemplateExpansionContext,
  processor: TemplateExpressionProcessor,
): void {
  const processed = processor.processValue(value, context);
  if (processed !== null && typeof processed === 'object' && !Array.isArray(processed)) {
    Object.assign(target, processed);
  }
}

// ─── Error type ─────────────────────────────────────────────────────────────

export class TemplateExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateExpressionError';
  }
}

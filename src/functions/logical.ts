import type { ExpressionFunction, ExpressionResult } from './types.js';

/**
 * ADO-compatible truthiness check.
 * Falsy: '' | 0 | null | false | 'false' (case-insensitive) | '0'
 */
export function isTruthy(value: ExpressionResult): boolean {
  if (value === null || value === undefined) return false;
  if (value === false) return false;
  if (value === 0) return false;
  if (value === '') return false;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'false' || lower === '0') return false;
  }
  return true;
}

export const and: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  if (args.length < 2) return false;
  for (const arg of args) {
    if (!isTruthy(arg)) return false;
  }
  return true;
};

export const or: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  if (args.length < 2) return false;
  for (const arg of args) {
    if (isTruthy(arg)) return true;
  }
  return false;
};

export const not: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const a = args[0] ?? null;
  return !isTruthy(a);
};

export const xor: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const a = args[0] ?? null;
  const b = args[1] ?? null;
  return isTruthy(a) !== isTruthy(b);
};

export const iif: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const condition = args[0] ?? null;
  const trueValue = args.length > 1 ? args[1] : null;
  const falseValue = args.length > 2 ? args[2] : null;
  return isTruthy(condition) ? (trueValue ?? null) : (falseValue ?? null);
};

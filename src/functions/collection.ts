import type { ExpressionFunction, ExpressionResult } from './types.js';

function toStr(value: ExpressionResult): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  return '';
}

function areEqual(a: ExpressionResult, b: ExpressionResult): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  if (typeof a === typeof b) {
    if (typeof a === 'string' && typeof b === 'string') {
      return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
  }

  // Numeric coercion
  if (typeof a === 'number' || typeof b === 'number') {
    const numA = typeof a === 'number' ? a : (typeof a === 'string' ? Number(a) : null);
    const numB = typeof b === 'number' ? b : (typeof b === 'string' ? Number(b) : null);
    if (numA !== null && numB !== null && !isNaN(numA) && !isNaN(numB)) {
      return numA === numB;
    }
  }

  return toStr(a).toLowerCase() === toStr(b).toLowerCase();
}

export const containsValue: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const collection = args[0] ?? null;
  const value = args[1] ?? null;

  if (Array.isArray(collection)) {
    for (const item of collection) {
      if (areEqual(item as ExpressionResult, value)) return true;
    }
    return false;
  }

  if (collection !== null && typeof collection === 'object' && !Array.isArray(collection)) {
    const obj = collection as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (areEqual(obj[key] as ExpressionResult, value)) return true;
    }
    return false;
  }

  return false;
};

export const length: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const value = args[0] ?? null;

  if (value === null) return 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  // For numbers/booleans, convert to string and return length
  return String(value).length;
};

export const convertToJson: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const value = args[0] ?? null;
  return JSON.stringify(value);
};

const counterState = new Map<string, number>();

export const counter: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const prefix = toStr(args[0] ?? null);
  const seed = args.length > 1 ? args[1] : 0;

  if (!counterState.has(prefix)) {
    const seedNum = typeof seed === 'number' ? seed : parseInt(toStr(seed), 10);
    const initialValue = isNaN(seedNum) ? 0 : seedNum;
    counterState.set(prefix, initialValue);
    return initialValue;
  }

  const current = counterState.get(prefix)!;
  const next = current + 1;
  counterState.set(prefix, next);
  return next;
};

/** Reset counter state — used for testing */
export function resetCounters(): void {
  counterState.clear();
}

export const coalesce: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  for (const arg of args) {
    if (arg !== null && arg !== undefined && arg !== '') {
      return arg;
    }
  }
  return '';
};

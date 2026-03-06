import type { ExpressionFunction, ExpressionResult } from './types.js';

function toString(value: ExpressionResult): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return '';
  if (typeof value === 'object') return '';
  return String(value);
}

function toComparableNumber(value: ExpressionResult): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function areEqual(a: ExpressionResult, b: ExpressionResult): boolean {
  // null equality
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  // Both same primitive type
  if (typeof a === typeof b) {
    if (typeof a === 'string' && typeof b === 'string') {
      return a.toLowerCase() === b.toLowerCase();
    }
    if (typeof a === 'number' && typeof b === 'number') {
      return a === b;
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return a === b;
    }
  }

  // Mixed types — try numeric comparison first
  const numA = toComparableNumber(a);
  const numB = toComparableNumber(b);
  if (numA !== null && numB !== null) {
    return numA === numB;
  }

  // Fall back to case-insensitive string comparison
  return toString(a).toLowerCase() === toString(b).toLowerCase();
}

function compareValues(a: ExpressionResult, b: ExpressionResult): number {
  // null handling: null is less than everything except null
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  // Try numeric comparison first
  const numA = toComparableNumber(a);
  const numB = toComparableNumber(b);
  if (numA !== null && numB !== null) {
    return numA - numB;
  }

  // Fall back to case-insensitive string comparison
  const strA = toString(a).toLowerCase();
  const strB = toString(b).toLowerCase();
  if (strA < strB) return -1;
  if (strA > strB) return 1;
  return 0;
}

export const eq: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const a = args[0] ?? null;
  const b = args[1] ?? null;
  return areEqual(a, b);
};

export const ne: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const a = args[0] ?? null;
  const b = args[1] ?? null;
  return !areEqual(a, b);
};

export const gt: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const a = args[0] ?? null;
  const b = args[1] ?? null;
  return compareValues(a, b) > 0;
};

export const lt: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const a = args[0] ?? null;
  const b = args[1] ?? null;
  return compareValues(a, b) < 0;
};

export const ge: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const a = args[0] ?? null;
  const b = args[1] ?? null;
  return compareValues(a, b) >= 0;
};

export const le: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const a = args[0] ?? null;
  const b = args[1] ?? null;
  return compareValues(a, b) <= 0;
};

export const inFn: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  if (args.length < 2) return false;
  const needle = args[0] ?? null;
  for (let i = 1; i < args.length; i++) {
    if (areEqual(needle, args[i] ?? null)) return true;
  }
  return false;
};

export const notIn: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  if (args.length < 2) return true;
  const needle = args[0] ?? null;
  for (let i = 1; i < args.length; i++) {
    if (areEqual(needle, args[i] ?? null)) return false;
  }
  return true;
};

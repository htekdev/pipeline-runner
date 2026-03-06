import type { ExpressionFunction, ExpressionResult } from './types.js';

function toStr(value: ExpressionResult): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value) || typeof value === 'object') return '';
  return String(value);
}

export const contains: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const haystack = toStr(args[0] ?? null).toLowerCase();
  const needle = toStr(args[1] ?? null).toLowerCase();
  return haystack.includes(needle);
};

export const startsWith: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const str = toStr(args[0] ?? null).toLowerCase();
  const prefix = toStr(args[1] ?? null).toLowerCase();
  return str.startsWith(prefix);
};

export const endsWith: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const str = toStr(args[0] ?? null).toLowerCase();
  const suffix = toStr(args[1] ?? null).toLowerCase();
  return str.endsWith(suffix);
};

function padTwo(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function applyDateFormat(date: Date, spec: string): string {
  let result = spec;
  result = result.replace(/yyyy/g, String(date.getFullYear()));
  result = result.replace(/MM/g, padTwo(date.getMonth() + 1));
  result = result.replace(/dd/g, padTwo(date.getDate()));
  result = result.replace(/HH/g, padTwo(date.getHours()));
  result = result.replace(/mm/g, padTwo(date.getMinutes()));
  result = result.replace(/ss/g, padTwo(date.getSeconds()));
  return result;
}

function applyFormatSpec(value: ExpressionResult, spec: string): string {
  const str = toStr(value);
  // Try to parse as date for date format specifiers
  const dateSpecPattern = /^[yMdHhms]+$/;
  if (dateSpecPattern.test(spec)) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return applyDateFormat(date, spec);
    }
  }
  // If we can't apply the format spec, return the raw string
  return str;
}

export const format: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const fmt = toStr(args[0] ?? null);
  const formatArgs = args.slice(1);

  const result: string[] = [];
  let i = 0;

  while (i < fmt.length) {
    if (fmt[i] === '{') {
      if (i + 1 < fmt.length && fmt[i + 1] === '{') {
        // Escaped opening brace
        result.push('{');
        i += 2;
        continue;
      }

      // Find matching closing brace
      const closingIdx = fmt.indexOf('}', i + 1);
      if (closingIdx === -1) {
        // No closing brace, treat as literal
        result.push(fmt[i]);
        i++;
        continue;
      }

      const placeholder = fmt.substring(i + 1, closingIdx);
      const colonIdx = placeholder.indexOf(':');

      let indexStr: string;
      let formatSpec: string | null = null;

      if (colonIdx !== -1) {
        indexStr = placeholder.substring(0, colonIdx);
        formatSpec = placeholder.substring(colonIdx + 1);
      } else {
        indexStr = placeholder;
      }

      const argIndex = parseInt(indexStr, 10);
      if (!isNaN(argIndex) && argIndex >= 0 && argIndex < formatArgs.length) {
        const argValue = formatArgs[argIndex] ?? null;
        if (formatSpec) {
          result.push(applyFormatSpec(argValue, formatSpec));
        } else {
          result.push(toStr(argValue));
        }
      } else {
        // Invalid index — preserve the placeholder as-is
        result.push(`{${placeholder}}`);
      }

      i = closingIdx + 1;
    } else if (fmt[i] === '}') {
      if (i + 1 < fmt.length && fmt[i + 1] === '}') {
        // Escaped closing brace
        result.push('}');
        i += 2;
        continue;
      }
      result.push(fmt[i]);
      i++;
    } else {
      result.push(fmt[i]);
      i++;
    }
  }

  return result.join('');
};

export const join: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const separator = toStr(args[0] ?? null);
  const collection = args[1] ?? null;

  if (!Array.isArray(collection)) {
    return toStr(collection);
  }

  return collection.map((item) => {
    const val = item as ExpressionResult;
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return '';
    return toStr(val);
  }).join(separator);
};

export const split: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const str = toStr(args[0] ?? null);
  const delimiter = toStr(args[1] ?? null);
  if (delimiter === '') return [str];
  return str.split(delimiter);
};

export const replace: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  const str = toStr(args[0] ?? null);
  const oldValue = toStr(args[1] ?? null);
  const newValue = toStr(args[2] ?? null);
  if (oldValue === '') return str;
  // Replace all occurrences
  return str.split(oldValue).join(newValue);
};

export const upper: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  return toStr(args[0] ?? null).toUpperCase();
};

export const lower: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  return toStr(args[0] ?? null).toLowerCase();
};

export const trim: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
  return toStr(args[0] ?? null).trim();
};

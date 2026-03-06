import type { ExpressionFunction } from './types.js';
import type { StatusContext } from './types.js';

import * as logical from './logical.js';
import * as comparison from './comparison.js';
import * as stringFns from './string.js';
import * as collection from './collection.js';
import { createStatusFunctions } from './status.js';

export type { ExpressionFunction, StatusContext };
export type { ExpressionResult } from './types.js';
export type FunctionRegistry = Map<string, ExpressionFunction>;

export { isTruthy } from './logical.js';
export { resetCounters } from './collection.js';
export { createStatusFunctions } from './status.js';

export function createFunctionRegistry(statusContext?: StatusContext): FunctionRegistry {
  const registry: FunctionRegistry = new Map();

  // Logical functions
  registry.set('and', logical.and);
  registry.set('or', logical.or);
  registry.set('not', logical.not);
  registry.set('xor', logical.xor);
  registry.set('iif', logical.iif);

  // Comparison functions
  registry.set('eq', comparison.eq);
  registry.set('ne', comparison.ne);
  registry.set('gt', comparison.gt);
  registry.set('lt', comparison.lt);
  registry.set('ge', comparison.ge);
  registry.set('le', comparison.le);
  registry.set('in', comparison.inFn);
  registry.set('notin', comparison.notIn);

  // String functions
  registry.set('contains', stringFns.contains);
  registry.set('startswith', stringFns.startsWith);
  registry.set('endswith', stringFns.endsWith);
  registry.set('format', stringFns.format);
  registry.set('join', stringFns.join);
  registry.set('split', stringFns.split);
  registry.set('replace', stringFns.replace);
  registry.set('upper', stringFns.upper);
  registry.set('lower', stringFns.lower);
  registry.set('trim', stringFns.trim);

  // Collection functions
  registry.set('containsvalue', collection.containsValue);
  registry.set('length', collection.length);
  registry.set('converttojson', collection.convertToJson);
  registry.set('counter', collection.counter);
  registry.set('coalesce', collection.coalesce);

  // Status functions (require context)
  if (statusContext) {
    const statusFns = createStatusFunctions(statusContext);
    for (const [name, fn] of Object.entries(statusFns)) {
      registry.set(name.toLowerCase(), fn);
    }
  }

  return registry;
}

/**
 * Case-insensitive function lookup from the registry.
 */
export function lookupFunction(registry: FunctionRegistry, name: string): ExpressionFunction | undefined {
  return registry.get(name.toLowerCase());
}

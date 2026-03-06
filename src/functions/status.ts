import type { ExpressionFunction, ExpressionResult, StatusContext } from './types.js';

const SUCCEEDED_STATUSES = new Set(['succeeded', 'succeededwithissues']);
const TERMINAL_STATUSES = new Set(['succeeded', 'succeededwithissues', 'failed']);

function toStr(value: ExpressionResult): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

export function createStatusFunctions(context: StatusContext): Record<string, ExpressionFunction> {
  const succeeded: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
    if (args.length === 0) {
      // No args: check all dependency results
      const deps = Object.values(context.dependencyResults);
      if (deps.length === 0) {
        return SUCCEEDED_STATUSES.has(context.currentJobStatus.toLowerCase());
      }
      return deps.every((status) => SUCCEEDED_STATUSES.has(status.toLowerCase()));
    }
    // Check named jobs
    return args.every((arg) => {
      const name = toStr(arg);
      const status = context.dependencyResults[name];
      return status !== undefined && SUCCEEDED_STATUSES.has(status.toLowerCase());
    });
  };

  const failed: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
    if (args.length === 0) {
      const deps = Object.values(context.dependencyResults);
      if (deps.length === 0) {
        return context.currentJobStatus.toLowerCase() === 'failed';
      }
      return deps.some((status) => status.toLowerCase() === 'failed');
    }
    return args.some((arg) => {
      const name = toStr(arg);
      const status = context.dependencyResults[name];
      return status !== undefined && status.toLowerCase() === 'failed';
    });
  };

  const succeededOrFailed: ExpressionFunction = (...args: ExpressionResult[]): ExpressionResult => {
    if (args.length === 0) {
      return true;
    }
    return args.every((arg) => {
      const name = toStr(arg);
      const status = context.dependencyResults[name];
      return status !== undefined && TERMINAL_STATUSES.has(status.toLowerCase());
    });
  };

  const always: ExpressionFunction = (): ExpressionResult => {
    return true;
  };

  const canceled: ExpressionFunction = (): ExpressionResult => {
    return context.isCanceled;
  };

  return { succeeded, failed, succeededOrFailed, always, canceled };
}

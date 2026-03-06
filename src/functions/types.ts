export type { ExpressionResult } from '../types/expressions.js';
import type { ExpressionResult } from '../types/expressions.js';

export type ExpressionFunction = (...args: ExpressionResult[]) => ExpressionResult;

export interface StatusContext {
  currentJobStatus: string;
  dependencyResults: Record<string, string>;
  isCanceled: boolean;
}

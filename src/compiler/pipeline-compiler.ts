// Pipeline compiler — orchestrates template expansion and expression evaluation
// to produce a fully resolved pipeline definition from YAML source.

import * as path from 'node:path';
import { loadPipeline } from '../parser/yaml-loader.js';
import {
  TemplateEngine,
  type TemplateEngineOptions,
} from './template-engine.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompilationResult {
  pipeline: unknown;
  stats: {
    filesLoaded: number;
    templatesExpanded: number;
    expressionsEvaluated: number;
  };
  warnings: string[];
}

export interface PipelineCompilerOptions {
  templateOptions?: TemplateEngineOptions;
  basePath?: string;
}

// ─── Pipeline Compiler ──────────────────────────────────────────────────────

export class PipelineCompiler {
  private readonly templateEngine: TemplateEngine;
  private readonly basePath: string;

  constructor(options?: PipelineCompilerOptions) {
    this.basePath = options?.basePath ?? process.cwd();
    this.templateEngine = new TemplateEngine({
      ...options?.templateOptions,
      basePath: this.basePath,
    });
  }

  /**
   * Compile a pipeline file: load → expand templates → evaluate expressions.
   * Returns the fully resolved pipeline object with compilation stats.
   */
  async compile(
    filePath: string,
    parameters?: Record<string, unknown>,
  ): Promise<CompilationResult> {
    const resolvedPath = path.resolve(this.basePath, filePath);
    const pipeline = await loadPipeline(resolvedPath);
    return this.compileFromObject(pipeline, resolvedPath, parameters);
  }

  /**
   * Compile from an already-loaded YAML object.
   * Useful when the YAML has already been parsed externally.
   */
  async compileFromObject(
    pipeline: unknown,
    filePath: string,
    parameters?: Record<string, unknown>,
  ): Promise<CompilationResult> {
    if (
      pipeline === null ||
      typeof pipeline !== 'object' ||
      Array.isArray(pipeline)
    ) {
      throw new PipelineCompilationError(
        'Pipeline must be a YAML mapping (object)',
      );
    }

    const warnings: string[] = [];
    const pipelineObj = { ...(pipeline as Record<string, unknown>) };

    // Inject CLI parameters into extends if present
    if (parameters && pipelineObj.extends && typeof pipelineObj.extends === 'object') {
      const extendsObj = { ...(pipelineObj.extends as Record<string, unknown>) };
      extendsObj.parameters = {
        ...((extendsObj.parameters as Record<string, unknown>) ?? {}),
        ...parameters,
      };
      pipelineObj.extends = extendsObj;
    }

    // Apply CLI parameters to pipeline-level parameter defaults
    if (parameters && Array.isArray(pipelineObj.parameters)) {
      pipelineObj.parameters = applyParameterOverrides(
        pipelineObj.parameters as unknown[],
        parameters,
      );
    }

    // Expand all templates (this also processes if/each directives and expressions)
    const expanded = await this.templateEngine.expandPipeline(
      pipelineObj,
      filePath,
    );

    const engineStats = this.templateEngine.getStats();

    return {
      pipeline: expanded,
      stats: {
        filesLoaded: engineStats.filesLoaded,
        templatesExpanded: engineStats.filesLoaded,
        expressionsEvaluated: 0,
      },
      warnings,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Apply CLI parameter overrides to the pipeline's parameter definitions.
 * Updates the default values of matching parameters.
 */
function applyParameterOverrides(
  paramDefs: unknown[],
  overrides: Record<string, unknown>,
): unknown[] {
  return paramDefs.map((p) => {
    if (p !== null && typeof p === 'object') {
      const param = p as Record<string, unknown>;
      const name = String(param.name ?? '');
      if (name in overrides) {
        return { ...param, default: overrides[name] };
      }
    }
    return p;
  });
}

// ─── Error type ─────────────────────────────────────────────────────────────

export class PipelineCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineCompilationError';
  }
}

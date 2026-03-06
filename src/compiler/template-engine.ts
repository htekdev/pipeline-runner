// Template engine — loads, resolves, and expands template references in pipelines.
// Handles step, job, stage, variable, and extends templates with recursion limits.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { ExpressionEngine } from './expression-engine.js';
import { createExpressionEngine } from './expression-engine.js';
import { createFunctionRegistry } from '../functions/index.js';
import { resolveTemplatePath } from '../parser/yaml-loader.js';
import {
  createTemplateExpressionProcessor,
  type TemplateExpansionContext,
  type TemplateExpressionProcessor,
} from './template-expressions.js';

// Re-export for consumers
export type { TemplateExpansionContext } from './template-expressions.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateEngineOptions {
  maxFiles?: number; // default 100
  maxNestingDepth?: number; // default 100
  maxMemoryBytes?: number; // default 20 * 1024 * 1024
  basePath?: string; // base path for resolving templates
}

interface ParameterDef {
  name: string;
  type: string;
  default: unknown;
}

// Content key types recognized in template files
const CONTENT_KEYS = ['steps', 'jobs', 'stages', 'variables'] as const;
type ContentKey = (typeof CONTENT_KEYS)[number];

// ─── Template Engine ────────────────────────────────────────────────────────

export class TemplateEngine {
  private readonly maxFiles: number;
  private readonly maxNestingDepth: number;
  private readonly maxMemoryBytes: number;

  private filesLoaded = 0;
  private currentDepth = 0;
  private memoryUsed = 0;

  private readonly expressionEngine: ExpressionEngine;
  private readonly processor: TemplateExpressionProcessor;

  constructor(options?: TemplateEngineOptions) {
    this.maxFiles = options?.maxFiles ?? 100;
    this.maxNestingDepth = options?.maxNestingDepth ?? 100;
    this.maxMemoryBytes = options?.maxMemoryBytes ?? 20 * 1024 * 1024;

    const registry = createFunctionRegistry();
    this.expressionEngine = createExpressionEngine(registry);
    this.processor = createTemplateExpressionProcessor(this.expressionEngine);
  }

  /**
   * Expand a pipeline definition, resolving all template references.
   * This is the main entry point for pipeline template expansion.
   */
  async expandPipeline(
    pipeline: unknown,
    filePath: string,
  ): Promise<unknown> {
    if (pipeline === null || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
      return pipeline;
    }

    const pipelineObj = pipeline as Record<string, unknown>;
    const result = { ...pipelineObj };

    // Handle extends first — the template defines the pipeline structure
    if (result.extends && typeof result.extends === 'object') {
      const extendsRef = result.extends as {
        template: string;
        parameters?: Record<string, unknown>;
      };
      const expanded = await this.expandExtends(extendsRef, filePath);

      if (expanded !== null && typeof expanded === 'object' && !Array.isArray(expanded)) {
        const expandedObj = expanded as Record<string, unknown>;
        delete result.extends;

        // Template provides the structure; merge its content into the result
        for (const [key, value] of Object.entries(expandedObj)) {
          result[key] = value;
        }
      }
    }

    // Build expression context from pipeline-level parameters
    const context = this.createPipelineContext(result);

    // Expand template references and process expressions in each section
    if (Array.isArray(result.stages)) {
      result.stages = await this.expandStages(
        result.stages,
        filePath,
        context,
      );
    }
    if (Array.isArray(result.jobs)) {
      result.jobs = await this.expandJobs(result.jobs, filePath, context);
    }
    if (Array.isArray(result.steps)) {
      result.steps = await this.expandSteps(result.steps, filePath, context);
    }
    if (Array.isArray(result.variables)) {
      result.variables = await this.expandVariables(
        result.variables,
        filePath,
        context,
      );
    }

    return result;
  }

  /**
   * Expand template references in a steps array.
   * Processes if/each directives, then expands any template references.
   */
  async expandSteps(
    steps: unknown[],
    filePath: string,
    context: TemplateExpansionContext,
  ): Promise<unknown[]> {
    const processed = this.processor.processArray(steps, context);
    return this.expandTemplateRefsInArray(processed, filePath, 'steps', context);
  }

  /**
   * Expand template references in a jobs array.
   */
  async expandJobs(
    jobs: unknown[],
    filePath: string,
    context: TemplateExpansionContext,
  ): Promise<unknown[]> {
    const processed = this.processor.processArray(jobs, context);
    const result: unknown[] = [];

    for (const job of processed) {
      if (this.isTemplateReference(job)) {
        const ref = job as {
          template: string;
          parameters?: Record<string, unknown>;
        };
        const expanded = await this.loadAndExpandTemplate(
          ref,
          filePath,
          'jobs',
          context,
        );
        result.push(...expanded);
      } else {
        // Recursively expand steps within job definitions
        if (
          job !== null &&
          typeof job === 'object' &&
          !Array.isArray(job)
        ) {
          const jobObj = { ...(job as Record<string, unknown>) };
          if (Array.isArray(jobObj.steps)) {
            jobObj.steps = await this.expandSteps(
              jobObj.steps,
              filePath,
              context,
            );
          }
          result.push(jobObj);
        } else {
          result.push(job);
        }
      }
    }

    return result;
  }

  /**
   * Expand template references in a stages array.
   */
  async expandStages(
    stages: unknown[],
    filePath: string,
    context: TemplateExpansionContext,
  ): Promise<unknown[]> {
    const processed = this.processor.processArray(stages, context);
    const result: unknown[] = [];

    for (const stage of processed) {
      if (this.isTemplateReference(stage)) {
        const ref = stage as {
          template: string;
          parameters?: Record<string, unknown>;
        };
        const expanded = await this.loadAndExpandTemplate(
          ref,
          filePath,
          'stages',
          context,
        );
        result.push(...expanded);
      } else {
        // Recursively expand jobs within stage definitions
        if (
          stage !== null &&
          typeof stage === 'object' &&
          !Array.isArray(stage)
        ) {
          const stageObj = { ...(stage as Record<string, unknown>) };
          if (Array.isArray(stageObj.jobs)) {
            stageObj.jobs = await this.expandJobs(
              stageObj.jobs,
              filePath,
              context,
            );
          }
          result.push(stageObj);
        } else {
          result.push(stage);
        }
      }
    }

    return result;
  }

  /**
   * Expand template references in a variables array.
   */
  async expandVariables(
    variables: unknown[],
    filePath: string,
    context: TemplateExpansionContext,
  ): Promise<unknown[]> {
    const processed = this.processor.processArray(variables, context);
    return this.expandTemplateRefsInArray(
      processed,
      filePath,
      'variables',
      context,
    );
  }

  /**
   * Process an extends template reference.
   * The template defines the full pipeline structure; parameters are passed from the pipeline.
   */
  async expandExtends(
    extendsRef: { template: string; parameters?: Record<string, unknown> },
    filePath: string,
  ): Promise<unknown> {
    const templatePath = resolveTemplatePath(extendsRef.template, filePath);
    const { content, rawSize } = await this.loadTemplateFile(templatePath);
    this.trackMemory(rawSize);

    if (content === null || typeof content !== 'object' || Array.isArray(content)) {
      throw new TemplateError(
        `Extends template must be a YAML mapping: ${templatePath}`,
      );
    }

    const templateObj = content as Record<string, unknown>;
    const paramDefs = this.extractParameterDefinitions(templateObj);
    const mergedParams = this.mergeParameters(
      paramDefs,
      extendsRef.parameters ?? {},
    );

    const context: TemplateExpansionContext = {
      parameters: mergedParams,
      variables: {},
      expressionContext: {
        variables: {},
        parameters: mergedParams,
        dependencies: {},
        pipeline: {},
      },
    };

    // Build template content (everything except the parameters definition)
    const templateContent: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(templateObj)) {
      if (key !== 'parameters') {
        templateContent[key] = value;
      }
    }

    // Process template expressions in the content
    const processed = this.processor.processValue(
      templateContent,
      context,
    ) as Record<string, unknown>;

    this.currentDepth++;
    this.checkLimits();

    // Recursively expand template references in the extends result
    const expanded = { ...processed };
    if (Array.isArray(expanded.stages)) {
      expanded.stages = await this.expandStages(
        expanded.stages,
        templatePath,
        context,
      );
    }
    if (Array.isArray(expanded.jobs)) {
      expanded.jobs = await this.expandJobs(
        expanded.jobs,
        templatePath,
        context,
      );
    }
    if (Array.isArray(expanded.steps)) {
      expanded.steps = await this.expandSteps(
        expanded.steps,
        templatePath,
        context,
      );
    }
    if (Array.isArray(expanded.variables)) {
      expanded.variables = await this.expandVariables(
        expanded.variables,
        templatePath,
        context,
      );
    }

    this.currentDepth--;

    return expanded;
  }

  /**
   * Get statistics about the template expansion process.
   */
  getStats(): {
    filesLoaded: number;
    nestingDepth: number;
    memoryUsed: number;
  } {
    return {
      filesLoaded: this.filesLoaded,
      nestingDepth: this.currentDepth,
      memoryUsed: this.memoryUsed,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  /**
   * Load a template YAML file, tracking file count for limit enforcement.
   */
  private async loadTemplateFile(
    templatePath: string,
  ): Promise<{ content: unknown; rawSize: number }> {
    this.filesLoaded++;
    this.checkLimits();

    try {
      const rawContent = await fs.readFile(templatePath, 'utf-8');
      const content = yaml.load(rawContent);
      return { content, rawSize: rawContent.length };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new TemplateError(
          `Template file not found: ${templatePath}`,
        );
      }
      throw err;
    }
  }

  /**
   * Load a template file, merge parameters, process expressions,
   * and return the expanded content array.
   */
  private async loadAndExpandTemplate(
    ref: { template: string; parameters?: Record<string, unknown> },
    basePath: string,
    expectedKey: ContentKey,
    parentContext: TemplateExpansionContext,
  ): Promise<unknown[]> {
    const templatePath = resolveTemplatePath(ref.template, basePath);
    const { content, rawSize } = await this.loadTemplateFile(templatePath);
    this.trackMemory(rawSize);

    if (content === null || typeof content !== 'object' || Array.isArray(content)) {
      throw new TemplateError(
        `Template must be a YAML mapping: ${templatePath}`,
      );
    }

    const templateObj = content as Record<string, unknown>;
    const paramDefs = this.extractParameterDefinitions(templateObj);
    const mergedParams = this.mergeParameters(
      paramDefs,
      ref.parameters ?? {},
    );

    const context: TemplateExpansionContext = {
      parameters: mergedParams,
      variables: parentContext.variables,
      expressionContext: {
        ...parentContext.expressionContext,
        parameters: mergedParams,
      },
    };

    // Find the content array — prefer the expected key, fall back to any content key
    const contentKey = this.findContentKey(templateObj, expectedKey);
    if (!contentKey) {
      throw new TemplateError(
        `Template '${templatePath}' does not contain a '${expectedKey}' array`,
      );
    }

    const contentArray = templateObj[contentKey] as unknown[];

    this.currentDepth++;
    this.checkLimits();

    let result: unknown[];
    switch (contentKey) {
      case 'steps':
        result = await this.expandSteps(contentArray, templatePath, context);
        break;
      case 'jobs':
        result = await this.expandJobs(contentArray, templatePath, context);
        break;
      case 'stages':
        result = await this.expandStages(contentArray, templatePath, context);
        break;
      case 'variables':
        result = await this.expandVariables(
          contentArray,
          templatePath,
          context,
        );
        break;
    }

    this.currentDepth--;
    return result;
  }

  /**
   * Generic helper to expand template references in an array of items.
   * Used for steps and variables which don't need job/stage-specific recursion.
   */
  private async expandTemplateRefsInArray(
    items: unknown[],
    filePath: string,
    contentKey: ContentKey,
    context: TemplateExpansionContext,
  ): Promise<unknown[]> {
    const result: unknown[] = [];

    for (const item of items) {
      if (this.isTemplateReference(item)) {
        const ref = item as {
          template: string;
          parameters?: Record<string, unknown>;
        };
        const expanded = await this.loadAndExpandTemplate(
          ref,
          filePath,
          contentKey,
          context,
        );
        result.push(...expanded);
      } else {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Determine if an item is a template reference.
   * A template reference has a `template` string key and is not a step/job/stage definition.
   */
  private isTemplateReference(item: unknown): boolean {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return false;
    }
    const obj = item as Record<string, unknown>;
    // Must have a template key that's a string
    if (typeof obj.template !== 'string') return false;
    // Exclude actual step/job/stage types that happen to have unrelated keys
    const nonTemplateKeys = [
      'pwsh',
      'node',
      'python',
      'task',
      'job',
      'deployment',
      'stage',
    ];
    return !nonTemplateKeys.some((k) => k in obj);
  }

  /**
   * Find the content key in a template object (steps, jobs, stages, or variables).
   * Prefer the expected key; fall back to any matching content key.
   */
  private findContentKey(
    templateObj: Record<string, unknown>,
    expectedKey: ContentKey,
  ): ContentKey | null {
    if (Array.isArray(templateObj[expectedKey])) {
      return expectedKey;
    }
    for (const key of CONTENT_KEYS) {
      if (Array.isArray(templateObj[key])) {
        return key;
      }
    }
    return null;
  }

  /**
   * Extract parameter definitions from a template object's `parameters` array.
   */
  private extractParameterDefinitions(
    templateObj: Record<string, unknown>,
  ): ParameterDef[] {
    const params = templateObj.parameters;
    if (!Array.isArray(params)) return [];

    return params.map((p: unknown) => {
      if (p !== null && typeof p === 'object') {
        const param = p as Record<string, unknown>;
        return {
          name: String(param.name ?? ''),
          type: String(param.type ?? 'string'),
          default: param.default,
        };
      }
      return { name: String(p), type: 'string', default: undefined };
    });
  }

  /**
   * Merge parameter definitions with provided values.
   * Provided values override defaults; missing params fall back to defaults.
   */
  private mergeParameters(
    definitions: ParameterDef[],
    provided: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const def of definitions) {
      if (def.name in provided) {
        result[def.name] = provided[def.name];
      } else if (def.default !== undefined) {
        result[def.name] = def.default;
      }
    }

    // Include any provided params not in definitions (passthrough)
    for (const [key, value] of Object.entries(provided)) {
      if (!(key in result)) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Create a TemplateExpansionContext from a pipeline-level object.
   * Uses parameter defaults as the initial parameter values.
   */
  private createPipelineContext(
    pipeline: Record<string, unknown>,
  ): TemplateExpansionContext {
    const params: Record<string, unknown> = {};

    if (Array.isArray(pipeline.parameters)) {
      for (const p of pipeline.parameters) {
        if (p !== null && typeof p === 'object') {
          const param = p as Record<string, unknown>;
          if (param.default !== undefined) {
            params[String(param.name)] = param.default;
          }
        }
      }
    }

    return {
      parameters: params,
      variables: {},
      expressionContext: {
        variables: {},
        parameters: params,
        dependencies: {},
        pipeline: {},
      },
    };
  }

  private trackMemory(bytes: number): void {
    this.memoryUsed += bytes;
    if (this.memoryUsed > this.maxMemoryBytes) {
      throw new TemplateError(
        `Template memory limit exceeded: ${this.memoryUsed} bytes > ${this.maxMemoryBytes} bytes`,
      );
    }
  }

  private checkLimits(): void {
    if (this.filesLoaded > this.maxFiles) {
      throw new TemplateError(
        `Template file limit exceeded: ${this.filesLoaded} files > ${this.maxFiles} max`,
      );
    }
    if (this.currentDepth > this.maxNestingDepth) {
      throw new TemplateError(
        `Template nesting depth exceeded: ${this.currentDepth} > ${this.maxNestingDepth} max`,
      );
    }
  }
}

// ─── Error type ─────────────────────────────────────────────────────────────

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

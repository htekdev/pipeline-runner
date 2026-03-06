import { pipelineSchema } from './schema.js';
import type { PipelineDefinition } from '../types/pipeline.js';

export interface ValidationResult {
  success: boolean;
  data: PipelineDefinition;
  errors: string[];
}

export function validatePipeline(raw: unknown): ValidationResult {
  const result = pipelineSchema.safeParse(raw);

  if (result.success) {
    const semanticErrors = validateSemantics(result.data as PipelineDefinition);
    if (semanticErrors.length > 0) {
      return {
        success: false,
        data: result.data as PipelineDefinition,
        errors: semanticErrors,
      };
    }

    return {
      success: true,
      data: result.data as PipelineDefinition,
      errors: [],
    };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });

  return {
    success: false,
    data: raw as PipelineDefinition,
    errors,
  };
}

function validateSemantics(pipeline: PipelineDefinition): string[] {
  const errors: string[] = [];

  // Must have at least one of: stages, jobs, steps, or extends
  const hasContent = pipeline.stages || pipeline.jobs || pipeline.steps || pipeline.extends;
  if (!hasContent) {
    errors.push('Pipeline must define at least one of: stages, jobs, steps, or extends');
  }

  // Cannot have both stages and jobs at root level
  if (pipeline.stages && pipeline.jobs) {
    errors.push('Pipeline cannot define both "stages" and "jobs" at root level');
  }

  // Cannot have both stages and steps at root level
  if (pipeline.stages && pipeline.steps) {
    errors.push('Pipeline cannot define both "stages" and "steps" at root level');
  }

  // Cannot have both jobs and steps at root level
  if (pipeline.jobs && pipeline.steps) {
    errors.push('Pipeline cannot define both "jobs" and "steps" at root level');
  }

  // Validate stage names are unique
  if (pipeline.stages) {
    const stageNames = new Set<string>();
    for (const stage of pipeline.stages) {
      if ('stage' in stage) {
        if (stageNames.has(stage.stage)) {
          errors.push(`Duplicate stage name: "${stage.stage}"`);
        }
        stageNames.add(stage.stage);

        // Validate job names are unique within a stage
        if (stage.jobs) {
          const jobNames = new Set<string>();
          for (const job of stage.jobs) {
            const jobName = 'job' in job ? job.job : 'deployment' in job ? job.deployment : null;
            if (jobName) {
              if (jobNames.has(jobName)) {
                errors.push(`Duplicate job name "${jobName}" in stage "${stage.stage}"`);
              }
              jobNames.add(jobName);
            }
          }
        }
      }
    }
  }

  // Validate parameter names are unique
  if (pipeline.parameters) {
    const paramNames = new Set<string>();
    for (const param of pipeline.parameters) {
      if (paramNames.has(param.name)) {
        errors.push(`Duplicate parameter name: "${param.name}"`);
      }
      paramNames.add(param.name);

      // Validate default value matches allowed values
      if (param.values && param.default !== undefined) {
        const defaultStr = String(param.default);
        const allowedStrs = param.values.map(String);
        if (!allowedStrs.includes(defaultStr)) {
          errors.push(`Parameter "${param.name}" default value "${defaultStr}" is not in allowed values: [${allowedStrs.join(', ')}]`);
        }
      }
    }
  }

  return errors;
}

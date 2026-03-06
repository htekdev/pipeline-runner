import { loadPipeline } from '../../parser/yaml-loader.js';
import { validatePipeline } from '../../parser/validator.js';
import chalk from 'chalk';
import type { PipelineDefinition } from '../../types/pipeline.js';

export interface RunOptions {
  stage?: string;
  job?: string;
  verbose?: boolean;
  dryRun?: boolean;
  params: Record<string, string>;
}

export async function runCommand(file: string, options: RunOptions): Promise<void> {
  try {
    console.log(chalk.blue(`\n⚡ piperun v0.1.0\n`));
    console.log(chalk.gray(`Loading pipeline: ${file}`));

    const rawPipeline = await loadPipeline(file);
    const validation = validatePipeline(rawPipeline);

    if (!validation.success) {
      console.error(chalk.red('\n✖ Pipeline validation failed:\n'));
      for (const error of validation.errors) {
        console.error(chalk.red(`  • ${error}`));
      }
      process.exit(1);
    }

    const pipeline = validation.data;
    console.log(chalk.green(`✔ Pipeline loaded and validated`));

    if (pipeline.name) {
      console.log(chalk.white(`  Name: ${pipeline.name}`));
    }

    if (Object.keys(options.params).length > 0) {
      console.log(chalk.white(`  Parameters:`));
      for (const [key, value] of Object.entries(options.params)) {
        console.log(chalk.gray(`    ${key}: ${value}`));
      }
    }

    if (options.stage) {
      console.log(chalk.yellow(`  Filter: stage = ${options.stage}`));
    }
    if (options.job) {
      console.log(chalk.yellow(`  Filter: job = ${options.job}`));
    }

    const stats = getPipelineStats(pipeline);
    console.log(chalk.white(`  Stages: ${stats.stages} | Jobs: ${stats.jobs} | Steps: ${stats.steps}`));

    if (options.dryRun) {
      console.log(chalk.yellow('\n⚠ Dry run — no steps will be executed.\n'));
      process.exit(0);
    }

    // Phase 1: validate and report. Execution engine comes in Phase 5.
    console.log(chalk.yellow('\n⚠ Execution engine not yet implemented. Pipeline parsed successfully.\n'));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✖ Error: ${message}\n`));
    process.exit(1);
  }
}

interface PipelineStats {
  stages: number;
  jobs: number;
  steps: number;
}

function getPipelineStats(pipeline: PipelineDefinition): PipelineStats {
  let stages = 0;
  let jobs = 0;
  let steps = 0;

  if (pipeline.stages) {
    stages = pipeline.stages.length;
    for (const stage of pipeline.stages) {
      if ('jobs' in stage && stage.jobs) {
        jobs += stage.jobs.length;
        for (const job of stage.jobs) {
          if ('steps' in job && Array.isArray(job.steps)) {
            steps += job.steps.length;
          }
          if ('strategy' in job && 'deployment' in job) {
            const strategy = job.strategy;
            for (const stratType of ['runOnce', 'rolling', 'canary'] as const) {
              const strat = strategy?.[stratType];
              if (strat) {
                for (const hook of ['preDeploy', 'deploy', 'routeTraffic', 'postRouteTraffic'] as const) {
                  if (strat[hook]?.steps) {
                    steps += strat[hook].steps.length;
                  }
                }
                if (strat.on?.success?.steps) steps += strat.on.success.steps.length;
                if (strat.on?.failure?.steps) steps += strat.on.failure.steps.length;
              }
            }
          }
        }
      }
    }
  } else if (pipeline.jobs) {
    stages = 1;
    jobs = pipeline.jobs.length;
    for (const job of pipeline.jobs) {
      if ('steps' in job && Array.isArray(job.steps)) {
        steps += job.steps.length;
      }
    }
  } else if (pipeline.steps) {
    stages = 1;
    jobs = 1;
    steps = pipeline.steps.length;
  }

  return { stages, jobs, steps };
}

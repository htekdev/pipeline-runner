import { loadPipeline } from '../../parser/yaml-loader.js';
import { validatePipeline } from '../../parser/validator.js';
import chalk from 'chalk';

export interface PlanOptions {
  params: Record<string, string>;
}

export async function planCommand(file: string, options: PlanOptions): Promise<void> {
  try {
    console.log(chalk.blue(`\n⚡ piperun plan\n`));
    console.log(chalk.gray(`Compiling: ${file}\n`));

    const rawPipeline = await loadPipeline(file);
    const validation = validatePipeline(rawPipeline);

    if (!validation.success) {
      console.error(chalk.red('✖ Pipeline validation failed:\n'));
      for (const error of validation.errors) {
        console.error(chalk.red(`  • ${error}`));
      }
      process.exit(1);
    }

    const pipeline = validation.data;

    console.log(chalk.white.bold('Execution Plan:'));
    console.log(chalk.gray('─'.repeat(50)));

    if (pipeline.parameters && pipeline.parameters.length > 0) {
      console.log(chalk.white('\nParameters:'));
      for (const param of pipeline.parameters) {
        const value = options.params[param.name] ?? param.default ?? chalk.red('(required)');
        console.log(`  ${param.name}: ${chalk.cyan(String(value))} ${chalk.gray(`[${param.type}]`)}`);
      }
    }

    console.log(chalk.white('\nExecution Order:'));
    let order = 1;

    if (pipeline.stages) {
      for (const stage of pipeline.stages) {
        if ('stage' in stage) {
          console.log(`  ${chalk.cyan(`${order}.`)} Stage: ${chalk.white.bold(stage.stage)}`);
          order++;
          if (stage.condition) {
            console.log(`     ${chalk.gray(`condition: ${stage.condition}`)}`);
          }
          if (stage.jobs) {
            for (const job of stage.jobs) {
              if ('job' in job) {
                console.log(`     ${chalk.yellow(`${order}.`)} Job: ${chalk.white(job.job)}`);
                order++;
                if (job.strategy?.matrix) {
                  const matrixKeys = Object.keys(job.strategy.matrix);
                  console.log(`        ${chalk.gray(`matrix: ${matrixKeys.join(', ')}`)}`);
                }
              } else if ('deployment' in job) {
                const env = typeof job.environment === 'string' ? job.environment : job.environment.name;
                console.log(`     ${chalk.magenta(`${order}.`)} Deploy: ${chalk.white(job.deployment)} → ${env}`);
                order++;
              }
            }
          }
        }
      }
    } else if (pipeline.steps) {
      console.log(`  ${chalk.cyan('1.')} Stage: (default)`);
      console.log(`     ${chalk.yellow('2.')} Job: (default)`);
      order = 3;
      for (const step of pipeline.steps) {
        let name: string;
        if ('displayName' in step && step.displayName) {
          name = step.displayName;
        } else if ('pwsh' in step) {
          name = '[pwsh]';
        } else if ('node' in step) {
          name = '[node]';
        } else if ('python' in step) {
          name = '[python]';
        } else if ('task' in step) {
          name = step.task;
        } else {
          name = '(step)';
        }
        console.log(`        ${chalk.gray(`${order}.`)} ${name}`);
        order++;
      }
    }

    console.log(chalk.gray('\n─'.repeat(50)));
    console.log(chalk.yellow('⚠ This is a compilation preview. No steps were executed.\n'));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✖ Error: ${message}\n`));
    process.exit(1);
  }
}

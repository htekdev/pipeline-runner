import { loadPipeline } from '../../parser/yaml-loader.js';
import { validatePipeline } from '../../parser/validator.js';
import chalk from 'chalk';
import type { StepDefinition } from '../../types/pipeline.js';

export async function listCommand(file: string): Promise<void> {
  try {
    console.log(chalk.blue(`\n⚡ piperun list\n`));

    const rawPipeline = await loadPipeline(file);
    const validation = validatePipeline(rawPipeline);

    if (!validation.success) {
      console.error(chalk.red('✖ Pipeline validation failed. Run `piperun validate` for details.\n'));
      process.exit(1);
    }

    const pipeline = validation.data;

    if (pipeline.name) {
      console.log(chalk.white.bold(`Pipeline: ${pipeline.name}\n`));
    }

    if (pipeline.stages) {
      for (const stage of pipeline.stages) {
        const stageName = 'stage' in stage ? stage.stage : '(template)';
        const deps = 'dependsOn' in stage && stage.dependsOn
          ? ` ${chalk.gray(`← depends on: ${Array.isArray(stage.dependsOn) ? stage.dependsOn.join(', ') : stage.dependsOn}`)}`
          : '';
        console.log(`${chalk.cyan('▸ Stage:')} ${chalk.white.bold(stageName)}${deps}`);

        if ('jobs' in stage && stage.jobs) {
          for (const job of stage.jobs) {
            if ('job' in job) {
              const jobDeps = job.dependsOn
                ? ` ${chalk.gray(`← ${Array.isArray(job.dependsOn) ? job.dependsOn.join(', ') : job.dependsOn}`)}`
                : '';
              console.log(`  ${chalk.yellow('▹ Job:')} ${chalk.white(job.job)}${jobDeps}`);
              if (job.steps) {
                for (const step of job.steps) {
                  const stepName = getStepDisplayName(step);
                  console.log(`    ${chalk.gray('•')} ${stepName}`);
                }
              }
            } else if ('deployment' in job) {
              const env = typeof job.environment === 'string' ? job.environment : job.environment.name;
              console.log(`  ${chalk.magenta('▹ Deploy:')} ${chalk.white(job.deployment)} ${chalk.gray(`→ ${env}`)}`);
            } else if ('template' in job) {
              console.log(`  ${chalk.gray('▹ Template:')} ${job.template}`);
            }
          }
        }
      }
    } else if (pipeline.jobs) {
      console.log(chalk.cyan('▸ Stage:') + ' ' + chalk.white.bold('(default)'));
      for (const job of pipeline.jobs) {
        if ('job' in job) {
          console.log(`  ${chalk.yellow('▹ Job:')} ${chalk.white(job.job)}`);
        }
      }
    } else if (pipeline.steps) {
      console.log(chalk.cyan('▸ Stage:') + ' ' + chalk.white.bold('(default)'));
      console.log(`  ${chalk.yellow('▹ Job:')} ${chalk.white('(default)')}`);
      for (const step of pipeline.steps) {
        const stepName = getStepDisplayName(step);
        console.log(`    ${chalk.gray('•')} ${stepName}`);
      }
    }

    console.log('');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✖ Error: ${message}\n`));
    process.exit(1);
  }
}

function getStepDisplayName(step: StepDefinition): string {
  if ('displayName' in step && step.displayName) return step.displayName;
  if ('pwsh' in step) return chalk.blue('[pwsh]') + ' ' + truncate(step.pwsh);
  if ('node' in step) return chalk.green('[node]') + ' ' + truncate(step.node);
  if ('python' in step) return chalk.yellow('[python]') + ' ' + truncate(step.python);
  if ('task' in step) return chalk.magenta('[task]') + ' ' + step.task;
  if ('template' in step) return chalk.gray('[template]') + ' ' + step.template;
  return chalk.gray('(unknown step)');
}

function truncate(text: string, maxLen = 60): string {
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length > maxLen) {
    return firstLine.substring(0, maxLen - 3) + '...';
  }
  return firstLine;
}

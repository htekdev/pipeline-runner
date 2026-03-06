import chalk from 'chalk';
import { PipelineRunner } from '../../runtime/pipeline-runner.js';
import { StepRunner } from '../../runtime/step-runner.js';
import { ConditionEvaluator } from '../../runtime/condition-evaluator.js';
import { createExpressionEngine } from '../../compiler/expression-engine.js';
import { createFunctionRegistry } from '../../functions/index.js';
import type { StepRunnerOptions } from '../../runtime/step-runner.js';

export interface RunOptions {
  stage?: string;
  job?: string;
  verbose?: boolean;
  dryRun?: boolean;
  params: Record<string, string>;
}

export async function runCommand(file: string, options: RunOptions): Promise<void> {
  console.log(chalk.blue(`\n⚡ piperun v0.1.0\n`));

  const functionRegistry = createFunctionRegistry({
    currentJobStatus: 'Succeeded',
    dependencyResults: {},
    isCanceled: false,
  });
  const expressionEngine = createExpressionEngine(functionRegistry);
  const conditionEvaluator = new ConditionEvaluator(expressionEngine, functionRegistry);

  const runner = new PipelineRunner();

  // Handle SIGINT for graceful cancellation
  const sigintHandler = () => {
    runner.cancel();
  };
  process.on('SIGINT', sigintHandler);

  try {
    const result = await runner.run({
      filePath: file,
      params: options.params,
      workingDirectory: process.cwd(),
      stageFilter: options.stage,
      jobFilter: options.job,
      dryRun: options.dryRun,
      verbose: options.verbose,
      conditionEvaluator,
      stepRunnerFactory: (opts: StepRunnerOptions) => new StepRunner(opts),
    });

    process.exitCode = result.exitCode;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✖ Error: ${message}\n`));
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', sigintHandler);
  }
}

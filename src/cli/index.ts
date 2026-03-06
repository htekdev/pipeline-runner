import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { validateCommand } from './commands/validate.js';
import { listCommand } from './commands/list.js';
import { planCommand } from './commands/plan.js';

const program = new Command();

program
  .name('piperun')
  .description('A locally executable pipeline framework inspired by Azure DevOps YAML pipelines')
  .version('0.1.0');

// piperun run [file] [options]
program
  .command('run')
  .description('Run a pipeline')
  .argument('[file]', 'Pipeline YAML file', 'pipeline.yaml')
  .option('--stage <name>', 'Run only a specific stage (and its dependencies)')
  .option('--job <name>', 'Run only a specific job (and its dependencies)')
  .option('--verbose', 'Enable verbose output')
  .option('--dry-run', 'Compile and show execution plan without running')
  .allowUnknownOption(true) // for --param.* arguments
  .allowExcessArguments(true)
  .action(async (file: string, options: Record<string, unknown>) => {
    const params = parseParamArgs(process.argv);
    await runCommand(file, { ...options, params } as Parameters<typeof runCommand>[1]);
  });

// piperun validate [file]
program
  .command('validate')
  .description('Validate a pipeline YAML file')
  .argument('[file]', 'Pipeline YAML file', 'pipeline.yaml')
  .action(async (file: string) => {
    await validateCommand(file);
  });

// piperun list [file]
program
  .command('list')
  .description('List stages and jobs in a pipeline')
  .argument('[file]', 'Pipeline YAML file', 'pipeline.yaml')
  .action(async (file: string) => {
    await listCommand(file);
  });

// piperun plan [file]
program
  .command('plan')
  .description('Show the compiled execution plan')
  .argument('[file]', 'Pipeline YAML file', 'pipeline.yaml')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (file: string) => {
    const params = parseParamArgs(process.argv);
    await planCommand(file, { params });
  });

program.parse();

function parseParamArgs(argv: string[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--param\.([^=]+)=(.*)$/);
    if (match) {
      params[match[1]] = match[2];
    }
  }
  return params;
}

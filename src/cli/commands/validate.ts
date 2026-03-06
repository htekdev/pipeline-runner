import { loadPipeline } from '../../parser/yaml-loader.js';
import { validatePipeline } from '../../parser/validator.js';
import chalk from 'chalk';

export async function validateCommand(file: string): Promise<void> {
  try {
    console.log(chalk.blue(`\n⚡ piperun validate\n`));
    console.log(chalk.gray(`Validating: ${file}`));

    const rawPipeline = await loadPipeline(file);
    const validation = validatePipeline(rawPipeline);

    if (!validation.success) {
      console.error(chalk.red('\n✖ Validation failed:\n'));
      for (const error of validation.errors) {
        console.error(chalk.red(`  • ${error}`));
      }
      process.exit(1);
    }

    console.log(chalk.green('\n✔ Pipeline is valid.\n'));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✖ Error: ${message}\n`));
    process.exit(1);
  }
}

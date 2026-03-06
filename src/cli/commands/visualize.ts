import { loadPipeline } from '../../parser/yaml-loader.js';
import { validatePipeline } from '../../parser/validator.js';
import chalk from 'chalk';
import {
  DependencyGraph,
  normalizeDependsOn,
  type GraphNode,
} from '../../runtime/dependency-graph.js';
import type {
  PipelineDefinition,
  StageDefinition,
  JobDefinition,
  RegularJobDefinition,
  DeploymentJobDefinition,
  StepDefinition,
} from '../../types/pipeline.js';

/**
 * Visualize the pipeline dependency graph as a rich terminal diagram.
 * Shows stages grouped by topological sort batch (parallel stages side-by-side),
 * with jobs, steps, matrix strategies, and deployment environments.
 */
export async function visualizeCommand(file: string): Promise<void> {
  try {
    console.log(chalk.blue(`\n⚡ piperun visualize\n`));

    const rawPipeline = await loadPipeline(file);
    const validation = validatePipeline(rawPipeline);

    if (!validation.success) {
      console.error(chalk.red('✖ Pipeline validation failed. Run `piperun validate` for details.\n'));
      for (const error of validation.errors) {
        console.error(chalk.red(`  • ${error}`));
      }
      return;
    }

    const pipeline = validation.data;

    if (pipeline.name) {
      console.log(chalk.white.bold(`Pipeline: ${pipeline.name}\n`));
    }

    const stages = normalizePipelineToStages(pipeline);

    if (stages.length === 0) {
      console.log(chalk.yellow('(empty pipeline — no stages, jobs, or steps defined)\n'));
      return;
    }

    const batches = computeBatches(stages);
    const stageBoxes = stages.map((stage) => buildStageBox(stage));
    const boxLookup = new Map(stageBoxes.map((b) => [b.stageId, b]));

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const boxes = batch.map((id) => boxLookup.get(id)).filter(isDefined);

      renderBoxRow(boxes);

      if (batchIdx < batches.length - 1) {
        renderConnectionArrows(batch, batches[batchIdx + 1], stages);
      }
    }

    console.log('');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✖ Error: ${message}\n`));
  }
}

// ── Normalize pipeline to stages ──────────────────────────────────────

function normalizePipelineToStages(pipeline: PipelineDefinition): StageDefinition[] {
  if (pipeline.stages && pipeline.stages.length > 0) {
    return pipeline.stages;
  }

  if (pipeline.jobs && pipeline.jobs.length > 0) {
    return [{
      stage: '(default)',
      jobs: pipeline.jobs,
    }];
  }

  if (pipeline.steps && pipeline.steps.length > 0) {
    const defaultJob: RegularJobDefinition = {
      job: '(default)',
      steps: pipeline.steps,
    };
    return [{
      stage: '(default)',
      jobs: [defaultJob],
    }];
  }

  return [];
}

// ── Topological batches ───────────────────────────────────────────────

function computeBatches(stages: StageDefinition[]): string[][] {
  if (stages.length === 0) return [];

  const nodes: GraphNode[] = stages.map((s) => ({
    id: s.stage,
    dependsOn: normalizeDependsOn(s.dependsOn),
  }));

  const graph = new DependencyGraph(nodes);
  return graph.getExecutionOrder();
}

// ── Stage box model ───────────────────────────────────────────────────

interface StageBox {
  stageId: string;
  lines: string[];      // colored content lines
  plainLines: string[]; // uncolored lines for width measurement
  width: number;
}

function buildStageBox(stage: StageDefinition): StageBox {
  const contentLines: Array<{ colored: string; plain: string }> = [];

  // Stage header
  const stageLabel = stage.displayName ?? stage.stage;
  contentLines.push({
    colored: chalk.cyan.bold(`Stage: ${stageLabel}`),
    plain: `Stage: ${stageLabel}`,
  });

  // Dependencies
  const deps = normalizeDependsOn(stage.dependsOn);
  if (deps.length > 0) {
    const depStr = `depends: ${deps.join(', ')}`;
    contentLines.push({
      colored: chalk.gray(depStr),
      plain: depStr,
    });
  }

  // Condition
  if (stage.condition) {
    const condStr = `condition: ${truncate(stage.condition, 40)}`;
    contentLines.push({
      colored: chalk.gray(condStr),
      plain: condStr,
    });
  }

  // Jobs
  const jobs = stage.jobs ?? [];
  for (const job of jobs) {
    const jobLines = buildJobLines(job);
    contentLines.push(...jobLines);
  }

  // Compute content width (based on uncolored text)
  const innerWidth = Math.max(
    ...contentLines.map((l) => l.plain.length),
    16, // minimum box width
  );

  // Build the box
  const top = `┌${'─'.repeat(innerWidth + 2)}┐`;
  const divider = `├${'─'.repeat(innerWidth + 2)}┤`;
  const bottom = `└${'─'.repeat(innerWidth + 2)}┘`;

  const lines: string[] = [];
  const plainLines: string[] = [];

  lines.push(top);
  plainLines.push(top);

  // First section: stage header + deps/condition
  let headerEnd = 1; // at least the stage name
  if (deps.length > 0) headerEnd++;
  if (stage.condition) headerEnd++;

  for (let i = 0; i < contentLines.length; i++) {
    const { colored, plain } = contentLines[i];
    const pad = innerWidth - plain.length;
    lines.push(`│ ${colored}${' '.repeat(pad)} │`);
    plainLines.push(`│ ${plain}${' '.repeat(pad)} │`);

    if (i === headerEnd - 1 && jobs.length > 0) {
      lines.push(divider);
      plainLines.push(divider);
    }
  }

  lines.push(bottom);
  plainLines.push(bottom);

  return {
    stageId: stage.stage,
    lines,
    plainLines,
    width: innerWidth + 4, // 2 for borders + 2 for padding
  };
}

function buildJobLines(job: JobDefinition): Array<{ colored: string; plain: string }> {
  const lines: Array<{ colored: string; plain: string }> = [];

  if ('job' in job) {
    return buildRegularJobLines(job);
  }

  if ('deployment' in job) {
    return buildDeploymentJobLines(job);
  }

  if ('template' in job) {
    const tmplStr = `▹ Template: ${job.template}`;
    lines.push({
      colored: chalk.gray(tmplStr),
      plain: tmplStr,
    });
  }

  return lines;
}

function buildRegularJobLines(
  job: RegularJobDefinition,
): Array<{ colored: string; plain: string }> {
  const lines: Array<{ colored: string; plain: string }> = [];

  const jobLabel = job.displayName ?? job.job;
  const jobStr = `▸ Job: ${jobLabel}`;
  lines.push({
    colored: `${chalk.yellow('▸')} ${chalk.yellow('Job:')} ${chalk.white(jobLabel)}`,
    plain: jobStr,
  });

  // Matrix strategy
  if (job.strategy?.matrix) {
    const configs = Object.keys(job.strategy.matrix);
    const matrixStr = `  matrix: ${configs.length} config${configs.length !== 1 ? 's' : ''} (${configs.join(', ')})`;
    const truncatedMatrix = truncate(matrixStr, 50);
    lines.push({
      colored: chalk.gray(truncatedMatrix),
      plain: truncatedMatrix,
    });

    if (job.strategy.maxParallel !== undefined) {
      const parallelStr = `  maxParallel: ${job.strategy.maxParallel}`;
      lines.push({
        colored: chalk.gray(parallelStr),
        plain: parallelStr,
      });
    }
  }

  // Condition
  if (job.condition) {
    const condStr = `  condition: ${truncate(job.condition, 35)}`;
    lines.push({
      colored: chalk.gray(condStr),
      plain: condStr,
    });
  }

  // Steps
  for (const step of job.steps) {
    const stepLine = formatStep(step);
    lines.push(stepLine);
  }

  return lines;
}

function buildDeploymentJobLines(
  job: DeploymentJobDefinition,
): Array<{ colored: string; plain: string }> {
  const lines: Array<{ colored: string; plain: string }> = [];

  const jobLabel = job.displayName ?? job.deployment;
  const deployStr = `▹ Deploy: ${jobLabel}`;
  lines.push({
    colored: `${chalk.magenta('▹')} ${chalk.magenta('Deploy:')} ${chalk.white(jobLabel)}`,
    plain: deployStr,
  });

  // Environment
  const envName = typeof job.environment === 'string' ? job.environment : job.environment.name;
  const envStr = `  env: ${envName}`;
  lines.push({
    colored: chalk.gray(envStr),
    plain: envStr,
  });

  // Strategy type
  const strategyType = getDeploymentStrategyType(job);
  const stratStr = `  strategy: ${strategyType}`;
  lines.push({
    colored: chalk.gray(stratStr),
    plain: stratStr,
  });

  // Canary increments
  if (job.strategy.canary?.increments) {
    const incStr = `  increments: [${job.strategy.canary.increments.join(', ')}]`;
    lines.push({
      colored: chalk.gray(incStr),
      plain: incStr,
    });
  }

  return lines;
}

function getDeploymentStrategyType(job: DeploymentJobDefinition): string {
  if (job.strategy.runOnce) return 'runOnce';
  if (job.strategy.rolling) return 'rolling';
  if (job.strategy.canary) return 'canary';
  return 'unknown';
}

function formatStep(step: StepDefinition): { colored: string; plain: string } {
  if ('displayName' in step && step.displayName) {
    const plain = `  • ${step.displayName}`;
    return {
      colored: `  ${chalk.gray('•')} ${step.displayName}`,
      plain,
    };
  }

  if ('pwsh' in step) {
    const script = truncate(step.pwsh, 35);
    const plain = `  • [pwsh] ${script}`;
    return {
      colored: `  ${chalk.gray('•')} ${chalk.blue('[pwsh]')} ${script}`,
      plain,
    };
  }

  if ('node' in step) {
    const script = truncate(step.node, 35);
    const plain = `  • [node] ${script}`;
    return {
      colored: `  ${chalk.gray('•')} ${chalk.green('[node]')} ${script}`,
      plain,
    };
  }

  if ('python' in step) {
    const script = truncate(step.python, 35);
    const plain = `  • [python] ${script}`;
    return {
      colored: `  ${chalk.gray('•')} ${chalk.yellow('[python]')} ${script}`,
      plain,
    };
  }

  if ('task' in step) {
    const plain = `  • [task] ${step.task}`;
    return {
      colored: `  ${chalk.gray('•')} ${chalk.magenta('[task]')} ${step.task}`,
      plain,
    };
  }

  if ('template' in step) {
    const plain = `  • [template] ${step.template}`;
    return {
      colored: `  ${chalk.gray('•')} ${chalk.gray('[template]')} ${step.template}`,
      plain,
    };
  }

  return { colored: `  ${chalk.gray('•')} (unknown step)`, plain: '  • (unknown step)' };
}

// ── Box rendering ─────────────────────────────────────────────────────

function renderBoxRow(boxes: StageBox[]): void {
  if (boxes.length === 0) return;

  const maxHeight = Math.max(...boxes.map((b) => b.lines.length));
  const gap = '     '; // 5-space gap between boxes

  for (let row = 0; row < maxHeight; row++) {
    const rowParts: string[] = [];
    for (let col = 0; col < boxes.length; col++) {
      const box = boxes[col];
      if (row < box.lines.length) {
        rowParts.push(box.lines[row]);
      } else {
        // Pad shorter boxes with spaces
        rowParts.push(' '.repeat(box.width));
      }
    }
    console.log(rowParts.join(gap));
  }
}

function renderConnectionArrows(
  currentBatch: string[],
  nextBatch: string[],
  stages: StageDefinition[],
): void {
  const stageLookup = new Map(stages.map((s) => [s.stage, s]));

  // Find which stages in nextBatch depend on which in currentBatch
  const connections: Array<{ fromIdx: number; toIdx: number }> = [];
  for (let toIdx = 0; toIdx < nextBatch.length; toIdx++) {
    const nextStage = stageLookup.get(nextBatch[toIdx]);
    if (!nextStage) continue;
    const deps = normalizeDependsOn(nextStage.dependsOn);
    for (let fromIdx = 0; fromIdx < currentBatch.length; fromIdx++) {
      if (deps.includes(currentBatch[fromIdx])) {
        connections.push({ fromIdx, toIdx });
      }
    }
  }

  if (connections.length === 0) {
    // No explicit dependencies but topological ordering implies it
    console.log(chalk.gray('         │'));
    console.log(chalk.gray('         ▼'));
    return;
  }

  // Simple rendering: show vertical arrows from each source
  // For single-connection or all-to-one patterns, use a merge connector
  const uniqueFroms = new Set(connections.map((c) => c.fromIdx));
  const uniqueTos = new Set(connections.map((c) => c.toIdx));

  if (uniqueFroms.size === 1 && uniqueTos.size === 1) {
    // Single connection — straight arrow
    console.log(chalk.gray('         │'));
    console.log(chalk.gray('         ▼'));
  } else if (uniqueTos.size === 1 && uniqueFroms.size > 1) {
    // Multiple sources merge into one target — fan-in
    const fromIndices = [...uniqueFroms].sort((a, b) => a - b);
    renderFanIn(fromIndices, currentBatch.length);
  } else if (uniqueFroms.size === 1 && uniqueTos.size > 1) {
    // One source fans out to multiple targets
    console.log(chalk.gray('         │'));
    console.log(chalk.gray('         ▼'));
  } else {
    // Complex connection pattern — simplified
    console.log(chalk.gray('         │'));
    console.log(chalk.gray('         ▼'));
  }
}

function renderFanIn(fromIndices: number[], totalInBatch: number): void {
  // Approximate center positions based on box column positions
  // Each box is ~24 chars wide + 5 gap = ~29 chars per slot
  const slotWidth = 29;
  const positions = fromIndices.map((idx) => idx * slotWidth + 9);

  // Draw vertical bars from each source
  const maxPos = Math.max(...positions);
  let line1 = '';
  let line2 = '';
  for (let i = 0; i <= maxPos; i++) {
    line1 += positions.includes(i) ? '│' : ' ';
    if (i === positions[0]) {
      line2 += '└';
    } else if (i === positions[positions.length - 1]) {
      line2 += '┘';
    } else if (positions.includes(i)) {
      line2 += '┴';
    } else if (i > positions[0] && i < positions[positions.length - 1]) {
      line2 += '─';
    } else {
      line2 += ' ';
    }
  }

  const midPoint = Math.floor((positions[0] + positions[positions.length - 1]) / 2);
  let line3 = ' '.repeat(midPoint) + '│';
  let line4 = ' '.repeat(midPoint) + '▼';

  console.log(chalk.gray(line1));
  console.log(chalk.gray(line2));
  console.log(chalk.gray(line3));
  console.log(chalk.gray(line4));
}

// ── Helpers ───────────────────────────────────────────────────────────

function truncate(text: string, maxLen = 60): string {
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length > maxLen) {
    return firstLine.substring(0, maxLen - 3) + '...';
  }
  return firstLine;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

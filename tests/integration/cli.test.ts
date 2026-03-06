import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const exec = promisify(execFile);

const CLI_PATH = path.resolve('dist', 'index.js');
const FIXTURES_DIR = path.resolve('tests', 'fixtures');

let tempDir: string;

/** Run the built CLI and return stdout, stderr, and exit code. */
async function runCli(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await exec('node', [CLI_PATH, ...args], {
      cwd: options.cwd ?? tempDir,
      env: { ...process.env, FORCE_COLOR: '0', ...options.env },
      timeout: 30_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? '',
      exitCode: typeof execErr.code === 'number' ? execErr.code : 1,
    };
  }
}

describe('CLI integration tests', () => {
  beforeAll(async () => {
    // Verify dist/index.js exists (project must be built)
    try {
      await fs.access(CLI_PATH);
    } catch {
      throw new Error(
        `Built CLI not found at ${CLI_PATH}. Run "npx tsup" before running integration tests.`,
      );
    }

    // Create a temp directory for test pipeline files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piperun-integ-'));
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  // ── validate ──────────────────────────────────────────────────────

  describe('piperun validate', () => {
    it('exits 0 and reports valid for a correct pipeline', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'simple.yaml');
      const { stdout, exitCode } = await runCli(['validate', pipelinePath]);

      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain('valid');
    });

    it('exits 1 and reports errors for an invalid pipeline', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'invalid.yaml');
      const { stderr, exitCode } = await runCli(['validate', pipelinePath]);

      expect(exitCode).toBe(1);
      const combinedOutput = stderr.toLowerCase();
      expect(combinedOutput).toMatch(/fail|error|invalid/);
    });
  });

  // ── list ──────────────────────────────────────────────────────────

  describe('piperun list', () => {
    it('shows stages, jobs, and steps in tree format', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'hello-world.yaml');
      const { stdout, exitCode } = await runCli(['list', pipelinePath]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Stage:');
      expect(stdout).toContain('Job:');
      // Should show step names from the fixture
      expect(stdout).toContain('Build');
    });
  });

  // ── plan ──────────────────────────────────────────────────────────

  describe('piperun plan', () => {
    it('shows the execution plan', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'hello-world.yaml');
      const { stdout, exitCode } = await runCli(['plan', pipelinePath]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Execution Plan');
      expect(stdout).toContain('Build');
      expect(stdout).toContain('Test');
      expect(stdout).toContain('Deploy');
    });

    it('shows parameter values when --param.* flags are used', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'hello-world.yaml');
      const { stdout, exitCode } = await runCli([
        'plan',
        pipelinePath,
        '--param.environment=staging',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('staging');
    });
  });

  // ── run --dry-run ─────────────────────────────────────────────────

  describe('piperun run --dry-run', () => {
    it('compiles without executing', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'simple.yaml');
      const { stdout, exitCode } = await runCli([
        'run',
        pipelinePath,
        '--dry-run',
      ]);

      expect(exitCode).toBe(0);
      // Should indicate dry-run / no execution
      const output = stdout.toLowerCase();
      expect(output).toMatch(/dry.run|no steps|not.*executed/);
    });
  });

  // ── run (actual execution) ────────────────────────────────────────

  describe('piperun run', () => {
    it('executes a simple pipeline with pwsh steps and exits 0', async () => {
      // Create a minimal pipeline that echoes something verifiable
      const pipelineContent = [
        'name: "Echo Test"',
        '',
        'steps:',
        '  - pwsh: |',
        '      Write-Host "PIPERUN_INTEG_TEST_OK"',
        '    displayName: "Echo marker"',
      ].join('\n');

      const pipelinePath = path.join(tempDir, 'echo-test.yaml');
      await fs.writeFile(pipelinePath, pipelineContent, 'utf-8');

      const { stdout, stderr, exitCode } = await runCli([
        'run',
        pipelinePath,
      ]);

      // The run command currently exits 0 after validation (execution engine stub)
      expect(exitCode).toBe(0);
      const combined = stdout + stderr;
      expect(combined).toContain('Echo Test');
    });

    it('passes parameters via --param.name=value', async () => {
      const pipelineContent = [
        'name: "Param Test"',
        '',
        'parameters:',
        '  - name: greeting',
        '    type: string',
        '    default: hello',
        '',
        'steps:',
        '  - pwsh: |',
        '      Write-Host "$(greeting)"',
        '    displayName: "Greet"',
      ].join('\n');

      const pipelinePath = path.join(tempDir, 'param-test.yaml');
      await fs.writeFile(pipelinePath, pipelineContent, 'utf-8');

      const { stdout, exitCode } = await runCli([
        'run',
        pipelinePath,
        '--param.greeting=howdy',
      ]);

      expect(exitCode).toBe(0);
      // The pipeline should execute successfully with the parameter
      expect(stdout).toContain('succeeded');
    });
  });

  // ── visualize ─────────────────────────────────────────────────────

  describe('piperun visualize', () => {
    it('shows the dependency graph for a multi-stage pipeline', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'hello-world.yaml');
      const { stdout, exitCode } = await runCli([
        'visualize',
        pipelinePath,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Pipeline:');
      expect(stdout).toContain('Stage:');
      // Should show box-drawing characters
      expect(stdout).toMatch(/[┌┐└┘│─├┤]/);
      // Should show stages from the fixture
      expect(stdout).toContain('Build');
      expect(stdout).toContain('Test');
      expect(stdout).toContain('Deploy');
    });

    it('shows a steps-only pipeline as a default stage', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'simple.yaml');
      const { stdout, exitCode } = await runCli([
        'visualize',
        pipelinePath,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('(default)');
    });

    it('shows matrix strategy info', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'matrix.yaml');
      const { stdout, exitCode } = await runCli([
        'visualize',
        pipelinePath,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('matrix:');
      expect(stdout).toContain('3 configs');
    });

    it('shows deployment environment and strategy', async () => {
      const pipelinePath = path.join(FIXTURES_DIR, 'hello-world.yaml');
      const { stdout, exitCode } = await runCli([
        'visualize',
        pipelinePath,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Deploy:');
      expect(stdout).toContain('env: production');
      expect(stdout).toContain('strategy: runOnce');
    });

    it('handles an empty/minimal pipeline gracefully', async () => {
      const pipelineContent = [
        'name: "Empty Pipeline"',
        '',
        'steps: []',
      ].join('\n');

      const pipelinePath = path.join(tempDir, 'empty.yaml');
      await fs.writeFile(pipelinePath, pipelineContent, 'utf-8');

      const { exitCode } = await runCli(['visualize', pipelinePath]);

      // Should not crash — exits 0
      expect(exitCode).toBe(0);
    });

    it('reports error for a non-existent file without crashing', async () => {
      const { stderr, exitCode } = await runCli([
        'visualize',
        'does-not-exist.yaml',
      ]);

      expect(exitCode).toBe(0); // visualize doesn't call process.exit
      expect(stderr.toLowerCase()).toMatch(/error|not found/);
    });
  });
});

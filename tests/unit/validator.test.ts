import { describe, it, expect } from 'vitest';
import { validatePipeline } from '../../src/parser/validator.js';
import { loadPipeline } from '../../src/parser/yaml-loader.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('validator', () => {
  describe('validatePipeline — valid inputs', () => {
    it('should validate a simple steps-only pipeline', () => {
      const result = validatePipeline({
        name: 'Simple',
        steps: [{ pwsh: 'echo hello', displayName: 'Hello' }],
      });
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a pipeline with stages, jobs, and steps', () => {
      const result = validatePipeline({
        name: 'Full Pipeline',
        stages: [
          {
            stage: 'Build',
            jobs: [
              {
                job: 'BuildApp',
                steps: [{ pwsh: 'npm run build' }],
              },
            ],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should validate a pipeline with parameters', () => {
      const result = validatePipeline({
        parameters: [
          {
            name: 'env',
            type: 'string',
            default: 'dev',
            values: ['dev', 'staging', 'prod'],
          },
          { name: 'debug', type: 'boolean', default: true },
        ],
        steps: [{ pwsh: 'echo test' }],
      });
      expect(result.success).toBe(true);
    });

    it('should validate a pipeline with node and python steps', () => {
      const result = validatePipeline({
        steps: [
          { node: 'console.log("hello")', displayName: 'Node Step' },
          { python: 'print("hello")', displayName: 'Python Step' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should validate a pipeline with task steps', () => {
      const result = validatePipeline({
        steps: [
          {
            task: 'MyTask@1',
            inputs: { arg1: 'value1' },
            displayName: 'My Task',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should validate a pipeline with deployment jobs', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'Deploy',
            jobs: [
              {
                deployment: 'DeployApp',
                environment: 'production',
                strategy: {
                  runOnce: {
                    deploy: {
                      steps: [{ pwsh: 'echo deploying' }],
                    },
                  },
                },
              },
            ],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should validate a pipeline with matrix strategy', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'Build',
            jobs: [
              {
                job: 'Matrix',
                strategy: {
                  matrix: {
                    linux: { os: 'linux' },
                    windows: { os: 'windows' },
                  },
                  maxParallel: 2,
                },
                steps: [{ pwsh: 'echo $(os)' }],
              },
            ],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should validate pool with vmImage', () => {
      const result = validatePipeline({
        pool: { vmImage: 'ubuntu-latest' },
        steps: [{ pwsh: 'echo hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should validate pool with demands', () => {
      const result = validatePipeline({
        pool: { name: 'my-pool', demands: ['docker', 'node'] },
        steps: [{ pwsh: 'echo hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should validate variables in array format', () => {
      const result = validatePipeline({
        variables: [
          { name: 'var1', value: 'value1' },
          { group: 'my-group' },
        ],
        steps: [{ pwsh: 'echo hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should validate variables in record/map format', () => {
      const result = validatePipeline({
        variables: { var1: 'value1', var2: 'value2' },
        steps: [{ pwsh: 'echo hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should validate step properties', () => {
      const result = validatePipeline({
        steps: [
          {
            pwsh: 'echo hello',
            displayName: 'Hello',
            name: 'helloStep',
            condition: "eq(variables.foo, 'bar')",
            enabled: true,
            continueOnError: true,
            timeoutInMinutes: 10,
            retryCountOnTaskFailure: 3,
            env: { MY_VAR: 'value' },
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should validate extends', () => {
      const result = validatePipeline({
        extends: {
          template: 'templates/base.yaml',
          parameters: { env: 'prod' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should validate resources', () => {
      const result = validatePipeline({
        resources: {
          repositories: [
            {
              repository: 'common',
              type: 'github',
              name: 'org/common',
              ref: 'main',
            },
          ],
          containers: [{ container: 'node', image: 'node:20' }],
        },
        steps: [{ pwsh: 'echo hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should validate container job', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'Build',
            jobs: [
              {
                job: 'ContainerJob',
                container: 'node:20',
                steps: [{ node: 'console.log("in container")' }],
              },
            ],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should validate a pipeline with only extends (no steps/jobs/stages)', () => {
      const result = validatePipeline({
        extends: { template: 'base.yaml' },
      });
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a pipeline with only jobs (no stages)', () => {
      const result = validatePipeline({
        jobs: [
          { job: 'Build', steps: [{ pwsh: 'echo build' }] },
          { job: 'Test', steps: [{ pwsh: 'echo test' }] },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('validatePipeline — fixture files', () => {
    it('should validate simple.yaml fixture', async () => {
      const raw = await loadPipeline(path.join(fixturesDir, 'simple.yaml'));
      const result = validatePipeline(raw);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate hello-world.yaml fixture', async () => {
      const raw = await loadPipeline(path.join(fixturesDir, 'hello-world.yaml'));
      const result = validatePipeline(raw);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate matrix.yaml fixture', async () => {
      const raw = await loadPipeline(path.join(fixturesDir, 'matrix.yaml'));
      const result = validatePipeline(raw);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid.yaml fixture (has both stages and jobs)', async () => {
      const raw = await loadPipeline(path.join(fixturesDir, 'invalid.yaml'));
      const result = validatePipeline(raw);
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('cannot define both "stages" and "jobs"'),
      );
    });
  });

  describe('validatePipeline — semantic errors', () => {
    it('should reject pipeline with no content', () => {
      const result = validatePipeline({ name: 'Empty' });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('must define at least one of'),
      );
    });

    it('should reject pipeline with both stages and jobs', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'A',
            jobs: [{ job: 'A1', steps: [{ pwsh: 'echo' }] }],
          },
        ],
        jobs: [{ job: 'B1', steps: [{ pwsh: 'echo' }] }],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('cannot define both "stages" and "jobs"'),
      );
    });

    it('should reject pipeline with both stages and steps', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'A',
            jobs: [{ job: 'A1', steps: [{ pwsh: 'echo' }] }],
          },
        ],
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('cannot define both "stages" and "steps"'),
      );
    });

    it('should reject pipeline with both jobs and steps', () => {
      const result = validatePipeline({
        jobs: [{ job: 'A', steps: [{ pwsh: 'echo' }] }],
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('cannot define both "jobs" and "steps"'),
      );
    });

    it('should reject pipeline with stages, jobs, and steps simultaneously', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'A',
            jobs: [{ job: 'A1', steps: [{ pwsh: 'echo' }] }],
          },
        ],
        jobs: [{ job: 'B1', steps: [{ pwsh: 'echo' }] }],
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject duplicate stage names', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'Build',
            jobs: [{ job: 'A', steps: [{ pwsh: 'echo' }] }],
          },
          {
            stage: 'Build',
            jobs: [{ job: 'B', steps: [{ pwsh: 'echo' }] }],
          },
        ],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Duplicate stage name'),
      );
    });

    it('should reject duplicate job names within a stage', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'Build',
            jobs: [
              { job: 'BuildApp', steps: [{ pwsh: 'echo' }] },
              { job: 'BuildApp', steps: [{ pwsh: 'echo' }] },
            ],
          },
        ],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Duplicate job name'),
      );
    });

    it('should reject duplicate parameter names', () => {
      const result = validatePipeline({
        parameters: [
          { name: 'env', type: 'string' },
          { name: 'env', type: 'number' },
        ],
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Duplicate parameter name'),
      );
    });

    it('should reject parameter default not in allowed values', () => {
      const result = validatePipeline({
        parameters: [
          {
            name: 'env',
            type: 'string',
            default: 'invalid',
            values: ['dev', 'staging', 'prod'],
          },
        ],
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('not in allowed values'),
      );
    });

    it('should allow unique stage names across multiple stages', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'Build',
            jobs: [{ job: 'A', steps: [{ pwsh: 'echo' }] }],
          },
          {
            stage: 'Test',
            jobs: [{ job: 'B', steps: [{ pwsh: 'echo' }] }],
          },
          {
            stage: 'Deploy',
            jobs: [{ job: 'C', steps: [{ pwsh: 'echo' }] }],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should allow same job name in different stages', () => {
      const result = validatePipeline({
        stages: [
          {
            stage: 'Build',
            jobs: [{ job: 'RunApp', steps: [{ pwsh: 'echo' }] }],
          },
          {
            stage: 'Deploy',
            jobs: [{ job: 'RunApp', steps: [{ pwsh: 'echo' }] }],
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('validatePipeline — Zod schema errors', () => {
    it('should reject invalid step (missing step type)', () => {
      const result = validatePipeline({
        steps: [{ displayName: 'bad step' } as any],
      });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid parameter type', () => {
      const result = validatePipeline({
        parameters: [{ name: 'bad', type: 'invalidType' as any }],
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject step with non-string pwsh value', () => {
      const result = validatePipeline({
        steps: [{ pwsh: 42 } as any],
      });
      expect(result.success).toBe(false);
    });

    it('should reject pool with invalid type', () => {
      const result = validatePipeline({
        pool: 123 as any,
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validatePipeline — result shape', () => {
    it('should return data property on success', () => {
      const result = validatePipeline({
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.steps).toBeDefined();
    });

    it('should return data and errors on failure', () => {
      const result = validatePipeline({ name: 'Empty' });
      expect(result.success).toBe(false);
      expect(result.data).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return formatted error paths from Zod issues', () => {
      const result = validatePipeline({
        parameters: [{ name: 123 as any, type: 'badType' as any }],
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
      // Errors should include path info
      for (const err of result.errors) {
        expect(typeof err).toBe('string');
      }
    });
  });
});

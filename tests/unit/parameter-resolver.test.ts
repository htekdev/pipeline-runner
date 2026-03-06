import { describe, it, expect, beforeEach } from 'vitest';
import { ParameterResolver } from '../../src/compiler/parameter-resolver.js';
import type { ParameterDefinition } from '../../src/types/pipeline.js';

describe('ParameterResolver', () => {
  let resolver: ParameterResolver;

  beforeEach(() => {
    resolver = new ParameterResolver();
  });

  // ─── Type Coercion ───────────────────────────────────────────────────

  describe('coerceValue', () => {
    it('should pass through string values', () => {
      expect(resolver.coerceValue('hello', 'string')).toBe('hello');
      expect(resolver.coerceValue('', 'string')).toBe('');
      expect(resolver.coerceValue('  spaces  ', 'string')).toBe('  spaces  ');
    });

    it('should coerce valid number strings to numbers', () => {
      expect(resolver.coerceValue('5', 'number')).toBe(5);
      expect(resolver.coerceValue('3.14', 'number')).toBe(3.14);
      expect(resolver.coerceValue('-10', 'number')).toBe(-10);
      expect(resolver.coerceValue('0', 'number')).toBe(0);
      expect(resolver.coerceValue('1e3', 'number')).toBe(1000);
    });

    it('should throw on invalid number strings', () => {
      expect(() => resolver.coerceValue('abc', 'number')).toThrow(
        "Cannot convert 'abc' to number",
      );
      expect(() => resolver.coerceValue('', 'number')).toThrow(
        'to number',
      );
      expect(() => resolver.coerceValue('12abc', 'number')).not.toThrow();
      // parseFloat('12abc') === 12, so it's permissive on trailing chars
    });

    it('should coerce truthy boolean strings to true', () => {
      for (const val of ['true', 'True', 'TRUE', '1', 'yes', 'YES', 'Yes']) {
        expect(resolver.coerceValue(val, 'boolean')).toBe(true);
      }
    });

    it('should coerce falsy boolean strings to false', () => {
      for (const val of ['false', 'False', 'FALSE', '0', 'no', 'NO', 'No']) {
        expect(resolver.coerceValue(val, 'boolean')).toBe(false);
      }
    });

    it('should throw on invalid boolean strings', () => {
      expect(() => resolver.coerceValue('maybe', 'boolean')).toThrow(
        "Cannot convert 'maybe' to boolean",
      );
      expect(() => resolver.coerceValue('2', 'boolean')).toThrow(
        'to boolean',
      );
    });

    it('should parse valid JSON for object type', () => {
      expect(resolver.coerceValue('{"key":"val"}', 'object')).toEqual({
        key: 'val',
      });
    });

    it('should throw on invalid JSON for object type', () => {
      expect(() => resolver.coerceValue('{bad json}', 'object')).toThrow(
        'invalid JSON',
      );
    });

    it('should parse JSON arrays for object type', () => {
      expect(resolver.coerceValue('[1,2,3]', 'object')).toEqual([1, 2, 3]);
    });

    it('should parse JSON for pipeline types (step, stepList, etc.)', () => {
      const stepJson = '{"pwsh":"echo hello"}';
      expect(resolver.coerceValue(stepJson, 'step')).toEqual({
        pwsh: 'echo hello',
      });

      const stepListJson = '[{"pwsh":"echo 1"},{"pwsh":"echo 2"}]';
      expect(resolver.coerceValue(stepListJson, 'stepList')).toEqual([
        { pwsh: 'echo 1' },
        { pwsh: 'echo 2' },
      ]);

      const jobJson = '{"job":"build","steps":[]}';
      expect(resolver.coerceValue(jobJson, 'job')).toEqual({
        job: 'build',
        steps: [],
      });

      const jobListJson = '[{"job":"build","steps":[]}]';
      expect(resolver.coerceValue(jobListJson, 'jobList')).toEqual([
        { job: 'build', steps: [] },
      ]);

      const stageJson = '{"stage":"deploy","jobs":[]}';
      expect(resolver.coerceValue(stageJson, 'stage')).toEqual({
        stage: 'deploy',
        jobs: [],
      });

      const stageListJson = '[{"stage":"deploy","jobs":[]}]';
      expect(resolver.coerceValue(stageListJson, 'stageList')).toEqual([
        { stage: 'deploy', jobs: [] },
      ]);
    });

    it('should throw on invalid JSON for pipeline types', () => {
      expect(() => resolver.coerceValue('not json', 'step')).toThrow(
        'invalid JSON',
      );
      expect(() => resolver.coerceValue('not json', 'jobList')).toThrow(
        'invalid JSON',
      );
    });
  });

  // ─── validateParameter ───────────────────────────────────────────────

  describe('validateParameter', () => {
    it('should accept correctly typed values', () => {
      expect(
        resolver.validateParameter(
          { name: 'env', type: 'string' },
          'production',
        ),
      ).toEqual({ valid: true, coerced: 'production' });

      expect(
        resolver.validateParameter({ name: 'count', type: 'number' }, 42),
      ).toEqual({ valid: true, coerced: 42 });

      expect(
        resolver.validateParameter({ name: 'debug', type: 'boolean' }, false),
      ).toEqual({ valid: true, coerced: false });
    });

    it('should reject incorrectly typed values', () => {
      const result = resolver.validateParameter(
        { name: 'count', type: 'number' },
        'not-a-number',
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expected type 'number'");
    });

    it('should reject NaN for number type', () => {
      const result = resolver.validateParameter(
        { name: 'count', type: 'number' },
        NaN,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expected type 'number'");
    });

    it('should validate object type requires non-null object', () => {
      expect(
        resolver.validateParameter(
          { name: 'config', type: 'object' },
          { key: 'val' },
        ).valid,
      ).toBe(true);

      expect(
        resolver.validateParameter(
          { name: 'config', type: 'object' },
          [1, 2],
        ).valid,
      ).toBe(true);

      const nullResult = resolver.validateParameter(
        { name: 'config', type: 'object' },
        null,
      );
      expect(nullResult.valid).toBe(false);
      expect(nullResult.error).toContain("expected type 'object'");

      const stringResult = resolver.validateParameter(
        { name: 'config', type: 'object' },
        'not-object',
      );
      expect(stringResult.valid).toBe(false);
    });

    it('should validate step/job/stage types require non-array objects', () => {
      expect(
        resolver.validateParameter(
          { name: 's', type: 'step' },
          { pwsh: 'echo hi' },
        ).valid,
      ).toBe(true);

      const arrayResult = resolver.validateParameter(
        { name: 's', type: 'step' },
        [{ pwsh: 'echo hi' }],
      );
      expect(arrayResult.valid).toBe(false);
      expect(arrayResult.error).toContain('array');
    });

    it('should validate stepList/jobList/stageList types require arrays', () => {
      expect(
        resolver.validateParameter(
          { name: 's', type: 'stepList' },
          [{ pwsh: 'echo hi' }],
        ).valid,
      ).toBe(true);

      const objResult = resolver.validateParameter(
        { name: 's', type: 'stepList' },
        { pwsh: 'echo hi' },
      );
      expect(objResult.valid).toBe(false);
      expect(objResult.error).toContain("expected type 'stepList' (array)");
    });

    // ─── Allowed Values ───────────────────────────────────────────────

    it('should accept value in allowed list', () => {
      const def: ParameterDefinition = {
        name: 'env',
        type: 'string',
        values: ['dev', 'staging', 'production'],
      };
      expect(resolver.validateParameter(def, 'staging').valid).toBe(true);
    });

    it('should reject value not in allowed list', () => {
      const def: ParameterDefinition = {
        name: 'env',
        type: 'string',
        values: ['dev', 'staging', 'production'],
      };
      const result = resolver.validateParameter(def, 'sandbox');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in the allowed values');
      expect(result.error).toContain('"dev"');
      expect(result.error).toContain('"staging"');
      expect(result.error).toContain('"production"');
    });

    it('should do case-insensitive matching for string allowed values', () => {
      const def: ParameterDefinition = {
        name: 'env',
        type: 'string',
        values: ['Dev', 'Staging', 'Production'],
      };
      expect(resolver.validateParameter(def, 'dev').valid).toBe(true);
      expect(resolver.validateParameter(def, 'STAGING').valid).toBe(true);
      expect(resolver.validateParameter(def, 'production').valid).toBe(true);
    });

    it('should enforce numeric allowed values', () => {
      const def: ParameterDefinition = {
        name: 'replicas',
        type: 'number',
        values: [1, 2, 3, 5],
      };
      expect(resolver.validateParameter(def, 3).valid).toBe(true);
      expect(resolver.validateParameter(def, 4).valid).toBe(false);
    });

    it('should enforce boolean allowed values', () => {
      const def: ParameterDefinition = {
        name: 'verbose',
        type: 'boolean',
        values: [true],
      };
      expect(resolver.validateParameter(def, true).valid).toBe(true);
      expect(resolver.validateParameter(def, false).valid).toBe(false);
    });
  });

  // ─── resolve ─────────────────────────────────────────────────────────

  describe('resolve', () => {
    it('should use default when CLI arg not provided', () => {
      const defs: ParameterDefinition[] = [
        { name: 'env', type: 'string', default: 'development' },
      ];
      const result = resolver.resolve(defs, {});
      expect(result.errors).toHaveLength(0);
      expect(result.values.env).toBe('development');
    });

    it('should let CLI arg override default', () => {
      const defs: ParameterDefinition[] = [
        { name: 'env', type: 'string', default: 'development' },
      ];
      const result = resolver.resolve(defs, { env: 'production' });
      expect(result.errors).toHaveLength(0);
      expect(result.values.env).toBe('production');
    });

    it('should error when no default and no CLI arg', () => {
      const defs: ParameterDefinition[] = [
        { name: 'env', type: 'string' },
      ];
      const result = resolver.resolve(defs, {});
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].parameter).toBe('env');
      expect(result.errors[0].message).toContain('not provided');
    });

    it('should let template args override defaults', () => {
      const defs: ParameterDefinition[] = [
        { name: 'env', type: 'string', default: 'development' },
      ];
      const result = resolver.resolve(defs, {}, { env: 'staging' });
      expect(result.errors).toHaveLength(0);
      expect(result.values.env).toBe('staging');
    });

    it('should let CLI args override template args', () => {
      const defs: ParameterDefinition[] = [
        { name: 'env', type: 'string', default: 'development' },
      ];
      const result = resolver.resolve(
        defs,
        { env: 'production' },
        { env: 'staging' },
      );
      expect(result.errors).toHaveLength(0);
      expect(result.values.env).toBe('production');
    });

    it('should resolve multiple parameters together', () => {
      const defs: ParameterDefinition[] = [
        { name: 'env', type: 'string', default: 'dev' },
        { name: 'count', type: 'number', default: 1 },
        { name: 'debug', type: 'boolean', default: false },
      ];
      const result = resolver.resolve(defs, {
        env: 'prod',
        count: '5',
        debug: 'true',
      });
      expect(result.errors).toHaveLength(0);
      expect(result.values).toEqual({
        env: 'prod',
        count: 5,
        debug: true,
      });
    });

    it('should collect all errors, not just the first', () => {
      const defs: ParameterDefinition[] = [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'number' },
        { name: 'c', type: 'boolean' },
      ];
      const result = resolver.resolve(defs, {});
      expect(result.errors).toHaveLength(3);
      expect(result.errors.map((e) => e.parameter)).toEqual(['a', 'b', 'c']);
    });

    it('should warn about extra CLI params not in definitions', () => {
      const defs: ParameterDefinition[] = [
        { name: 'env', type: 'string', default: 'dev' },
      ];
      const result = resolver.resolve(defs, { env: 'prod', extra: 'value' });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('extra');
      expect(result.warnings[0]).toContain('does not match');
    });

    it('should coerce CLI string values to the declared type', () => {
      const defs: ParameterDefinition[] = [
        { name: 'count', type: 'number' },
      ];
      const result = resolver.resolve(defs, { count: '42' });
      expect(result.errors).toHaveLength(0);
      expect(result.values.count).toBe(42);
      expect(typeof result.values.count).toBe('number');
    });

    it('should report coercion errors', () => {
      const defs: ParameterDefinition[] = [
        { name: 'count', type: 'number' },
      ];
      const result = resolver.resolve(defs, { count: 'abc' });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Cannot convert');
    });

    it('should validate allowed values after coercion', () => {
      const defs: ParameterDefinition[] = [
        {
          name: 'env',
          type: 'string',
          values: ['dev', 'staging', 'prod'],
        },
      ];
      const result = resolver.resolve(defs, { env: 'test' });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('not in the allowed values');
    });

    it('should accept allowed values after coercion', () => {
      const defs: ParameterDefinition[] = [
        {
          name: 'replicas',
          type: 'number',
          values: [1, 3, 5],
        },
      ];
      const result = resolver.resolve(defs, { replicas: '3' });
      expect(result.errors).toHaveLength(0);
      expect(result.values.replicas).toBe(3);
    });

    it('should mix CLI, template, and default values', () => {
      const defs: ParameterDefinition[] = [
        { name: 'fromCli', type: 'string' },
        { name: 'fromTemplate', type: 'number' },
        { name: 'fromDefault', type: 'boolean', default: true },
      ];
      const result = resolver.resolve(
        defs,
        { fromCli: 'hello' },
        { fromTemplate: 99 },
      );
      expect(result.errors).toHaveLength(0);
      expect(result.values).toEqual({
        fromCli: 'hello',
        fromTemplate: 99,
        fromDefault: true,
      });
    });

    it('should handle object parameters from CLI as JSON', () => {
      const defs: ParameterDefinition[] = [
        { name: 'config', type: 'object' },
      ];
      const result = resolver.resolve(defs, {
        config: '{"key":"val","nested":{"a":1}}',
      });
      expect(result.errors).toHaveLength(0);
      expect(result.values.config).toEqual({
        key: 'val',
        nested: { a: 1 },
      });
    });

    it('should handle object defaults from YAML as-is', () => {
      const defs: ParameterDefinition[] = [
        {
          name: 'config',
          type: 'object',
          default: { key: 'val' },
        },
      ];
      const result = resolver.resolve(defs, {});
      expect(result.errors).toHaveLength(0);
      expect(result.values.config).toEqual({ key: 'val' });
    });

    it('should pass-through pipeline types from template args', () => {
      const stepDef: ParameterDefinition = { name: 'preSteps', type: 'stepList' };
      const steps = [{ pwsh: 'echo pre1' }, { pwsh: 'echo pre2' }];
      const result = resolver.resolve([stepDef], {}, { preSteps: steps });
      expect(result.errors).toHaveLength(0);
      expect(result.values.preSteps).toEqual(steps);
    });

    it('should parse pipeline types from CLI as JSON', () => {
      const def: ParameterDefinition = { name: 'step', type: 'step' };
      const result = resolver.resolve(def ? [def] : [], {
        step: '{"pwsh":"echo hello"}',
      });
      expect(result.errors).toHaveLength(0);
      expect(result.values.step).toEqual({ pwsh: 'echo hello' });
    });

    it('should not produce warnings when all CLI args match definitions', () => {
      const defs: ParameterDefinition[] = [
        { name: 'a', type: 'string', default: '' },
        { name: 'b', type: 'string', default: '' },
      ];
      const result = resolver.resolve(defs, { a: 'x', b: 'y' });
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle empty definitions and empty CLI args', () => {
      const result = resolver.resolve([], {});
      expect(result.values).toEqual({});
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle validation errors on template-sourced values', () => {
      const defs: ParameterDefinition[] = [
        { name: 'count', type: 'number' },
      ];
      // Template passes a string where number is expected
      const result = resolver.resolve(defs, {}, { count: 'not-a-number' });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("expected type 'number'");
    });

    it('should validate allowed values on default values', () => {
      const defs: ParameterDefinition[] = [
        {
          name: 'env',
          type: 'string',
          default: 'invalid-default',
          values: ['dev', 'prod'],
        },
      ];
      const result = resolver.resolve(defs, {});
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('not in the allowed values');
    });
  });

  // ─── buildParameterContext ───────────────────────────────────────────

  describe('buildParameterContext', () => {
    it('should produce a flat record of parameter values', () => {
      const resolved = resolver.resolve(
        [
          { name: 'env', type: 'string', default: 'dev' },
          { name: 'count', type: 'number', default: 3 },
          { name: 'debug', type: 'boolean', default: false },
        ],
        {},
      );
      const ctx = resolver.buildParameterContext(resolved);
      expect(ctx).toEqual({ env: 'dev', count: 3, debug: false });
    });

    it('should return an empty record when there are no parameters', () => {
      const resolved = resolver.resolve([], {});
      const ctx = resolver.buildParameterContext(resolved);
      expect(ctx).toEqual({});
    });

    it('should include only successfully resolved parameters', () => {
      const resolved = resolver.resolve(
        [
          { name: 'good', type: 'string', default: 'ok' },
          { name: 'bad', type: 'number' }, // missing, will error
        ],
        {},
      );
      expect(resolved.errors).toHaveLength(1);
      const ctx = resolver.buildParameterContext(resolved);
      expect(ctx).toEqual({ good: 'ok' });
      expect('bad' in ctx).toBe(false);
    });
  });
});

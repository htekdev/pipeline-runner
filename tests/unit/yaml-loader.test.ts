import { describe, it, expect } from 'vitest';
import { loadPipeline, loadYamlFile, resolveTemplatePath } from '../../src/parser/yaml-loader.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('yaml-loader', () => {
  describe('loadPipeline', () => {
    it('should load a valid YAML pipeline file', async () => {
      const result = await loadPipeline(path.join(fixturesDir, 'simple.yaml'));
      expect(result).toBeDefined();
      expect(result).toHaveProperty('name', 'Simple Pipeline');
      expect(result).toHaveProperty('steps');
    });

    it('should load a complex pipeline with stages', async () => {
      const result = (await loadPipeline(
        path.join(fixturesDir, 'hello-world.yaml'),
      )) as any;
      expect(result.name).toBe('Hello World Pipeline');
      expect(result.stages).toHaveLength(3);
      expect(result.parameters).toHaveLength(2);
    });

    it('should load a pipeline with matrix strategy', async () => {
      const result = (await loadPipeline(
        path.join(fixturesDir, 'matrix.yaml'),
      )) as any;
      expect(result.name).toBe('Matrix Strategy Pipeline');
      expect(result.stages).toHaveLength(2);
      expect(result.stages[0].jobs[0].strategy.matrix).toBeDefined();
      expect(result.stages[0].jobs[0].strategy.maxParallel).toBe(2);
    });

    it('should load the invalid fixture as raw YAML without error', async () => {
      // loadPipeline only parses YAML — semantic validation is separate
      const result = (await loadPipeline(
        path.join(fixturesDir, 'invalid.yaml'),
      )) as any;
      expect(result.name).toBe('Invalid Pipeline');
      expect(result.stages).toBeDefined();
      expect(result.jobs).toBeDefined();
    });

    it('should throw for non-existent file', async () => {
      await expect(
        loadPipeline(path.join(fixturesDir, 'nonexistent.yaml')),
      ).rejects.toThrow('not found');
    });

    it('should throw for empty file', async () => {
      const tmpFile = path.join(fixturesDir, '_empty_test.yaml');
      await fs.writeFile(tmpFile, '');
      try {
        await expect(loadPipeline(tmpFile)).rejects.toThrow('empty');
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('should throw for whitespace-only file', async () => {
      const tmpFile = path.join(fixturesDir, '_whitespace_test.yaml');
      await fs.writeFile(tmpFile, '   \n\n  \t  \n');
      try {
        await expect(loadPipeline(tmpFile)).rejects.toThrow('empty');
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('should throw for invalid YAML syntax', async () => {
      const tmpFile = path.join(fixturesDir, '_bad_yaml_test.yaml');
      await fs.writeFile(tmpFile, 'key: [invalid: yaml: :::');
      try {
        await expect(loadPipeline(tmpFile)).rejects.toThrow('YAML parse error');
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('should throw for YAML that is not an object (scalar)', async () => {
      const tmpFile = path.join(fixturesDir, '_scalar_test.yaml');
      await fs.writeFile(tmpFile, '"just a string"');
      try {
        await expect(loadPipeline(tmpFile)).rejects.toThrow(
          'must contain a YAML object',
        );
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('should throw for YAML that is an array', async () => {
      const tmpFile = path.join(fixturesDir, '_array_test.yaml');
      await fs.writeFile(tmpFile, '- item1\n- item2\n');
      try {
        await expect(loadPipeline(tmpFile)).rejects.toThrow(
          'must contain a YAML object',
        );
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('should throw for YAML that is a number', async () => {
      const tmpFile = path.join(fixturesDir, '_number_test.yaml');
      await fs.writeFile(tmpFile, '42');
      try {
        await expect(loadPipeline(tmpFile)).rejects.toThrow(
          'must contain a YAML object',
        );
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('should return parsed steps with multiline strings', async () => {
      const result = (await loadPipeline(
        path.join(fixturesDir, 'simple.yaml'),
      )) as any;
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].pwsh).toContain('Write-Host');
      expect(result.steps[1].node).toContain('console.log');
      expect(result.steps[2].python).toContain('print');
    });
  });

  describe('loadYamlFile', () => {
    it('should load a YAML file and return parsed content', async () => {
      const result = (await loadYamlFile(
        path.join(fixturesDir, 'simple.yaml'),
      )) as any;
      expect(result).toBeDefined();
      expect(result.name).toBe('Simple Pipeline');
    });

    it('should return undefined for empty YAML content', async () => {
      const tmpFile = path.join(fixturesDir, '_loadyaml_empty.yaml');
      await fs.writeFile(tmpFile, '');
      try {
        const result = await loadYamlFile(tmpFile);
        expect(result).toBeUndefined();
      } finally {
        await fs.unlink(tmpFile);
      }
    });
  });

  describe('resolveTemplatePath', () => {
    it('should resolve a relative template path', () => {
      const base = '/repo/pipelines/main.yaml';
      const result = resolveTemplatePath('templates/steps.yaml', base);
      expect(result).toBe(path.resolve('/repo/pipelines', 'templates/steps.yaml'));
    });

    it('should resolve a sibling template path', () => {
      const base = '/repo/pipelines/main.yaml';
      const result = resolveTemplatePath('common.yaml', base);
      expect(result).toBe(path.resolve('/repo/pipelines', 'common.yaml'));
    });

    it('should resolve a parent directory template path', () => {
      const base = '/repo/pipelines/main.yaml';
      const result = resolveTemplatePath('../shared/steps.yaml', base);
      expect(result).toBe(path.resolve('/repo/pipelines', '../shared/steps.yaml'));
    });
  });
});

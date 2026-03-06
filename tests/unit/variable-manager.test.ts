import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VariableManager } from '../../src/variables/variable-manager.js';
import { OutputVariableStore } from '../../src/variables/output-variables.js';
import { SecretMasker } from '../../src/variables/secret-masker.js';
import type { VariableDefinition } from '../../src/types/variables.js';

// ─── SecretMasker ───────────────────────────────────────────────────────────────

describe('SecretMasker', () => {
  let masker: SecretMasker;

  beforeEach(() => {
    masker = new SecretMasker();
  });

  it('masks a secret value in a string', () => {
    masker.addSecret('password123');
    expect(masker.mask('My password is password123, ok?')).toBe(
      'My password is ***, ok?',
    );
  });

  it('masks multiple different secrets in one string', () => {
    masker.addSecret('alpha');
    masker.addSecret('beta');
    expect(masker.mask('alpha and beta together')).toBe(
      '*** and *** together',
    );
  });

  it('masks a secret appearing multiple times', () => {
    masker.addSecret('tok');
    expect(masker.mask('tok-tok-tok')).toBe('***-***-***');
  });

  it('does not mask empty string secrets', () => {
    masker.addSecret('');
    expect(masker.secretCount).toBe(0);
    expect(masker.mask('hello world')).toBe('hello world');
  });

  it('logs a warning for very short secrets but still masks them', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    masker.addSecret('ab');
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(masker.mask('xabx')).toBe('x***x');
    warnSpy.mockRestore();
  });

  it('replaces longest secrets first to prevent partial masking', () => {
    masker.addSecret('secret');
    masker.addSecret('secretValue');
    // "secretValue" should be masked as a whole, not "secret" + "Value"
    expect(masker.mask('the secretValue is hidden')).toBe(
      'the *** is hidden',
    );
  });

  it('returns original string when no secrets registered', () => {
    expect(masker.mask('nothing to mask')).toBe('nothing to mask');
  });

  it('returns empty string as-is', () => {
    masker.addSecret('secret');
    expect(masker.mask('')).toBe('');
  });

  it('handles secrets with regex special characters', () => {
    masker.addSecret('$100.00');
    expect(masker.mask('The price is $100.00 today')).toBe(
      'The price is *** today',
    );
  });

  it('removeSecret stops masking that value', () => {
    masker.addSecret('temp');
    expect(masker.mask('temp data')).toBe('*** data');
    masker.removeSecret('temp');
    expect(masker.mask('temp data')).toBe('temp data');
    expect(masker.secretCount).toBe(0);
  });

  it('secretCount tracks registered secrets', () => {
    expect(masker.secretCount).toBe(0);
    masker.addSecret('one');
    masker.addSecret('two');
    expect(masker.secretCount).toBe(2);
    masker.addSecret('one'); // duplicate
    expect(masker.secretCount).toBe(2);
  });

  it('createMaskingStream masks data flowing through it', async () => {
    masker.addSecret('hidden');
    const stream = masker.createMaskingStream();

    const chunks: string[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    });

    const finished = new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    stream.write('The hidden value is hidden here');
    stream.end();
    await finished;

    expect(chunks.join('')).toBe('The *** value is *** here');
  });
});

// ─── VariableManager ────────────────────────────────────────────────────────────

describe('VariableManager', () => {
  let vm: VariableManager;
  let tempDir: string;

  beforeEach(() => {
    vm = new VariableManager();
    tempDir = '';
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  // ── Scope basics ──

  it('sets and gets a variable at pipeline scope', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('foo', 'bar');
    expect(vm.get('foo')).toBe('bar');
  });

  it('gets undefined for non-existent variable', () => {
    vm.enterScope('pipeline', 'main');
    expect(vm.get('nope')).toBeUndefined();
  });

  it('throws when setting variable with no scope', () => {
    expect(() => vm.set('x', 'y')).toThrow('no scopes on the stack');
  });

  // ── Scope inheritance ──

  it('child scope sees parent variables', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('shared', 'fromPipeline');
    vm.enterScope('stage', 'build');
    expect(vm.get('shared')).toBe('fromPipeline');
  });

  it('child scope overrides parent value', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('color', 'red');
    vm.enterScope('job', 'compile');
    vm.set('color', 'blue');
    expect(vm.get('color')).toBe('blue');
  });

  it('exiting scope reveals parent value again', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('val', 'outer');
    vm.enterScope('job', 'j1');
    vm.set('val', 'inner');
    expect(vm.get('val')).toBe('inner');
    vm.exitScope();
    expect(vm.get('val')).toBe('outer');
  });

  it('throws when exiting with no scope', () => {
    expect(() => vm.exitScope()).toThrow('no scopes on the stack');
  });

  it('three-level scope hierarchy works: pipeline → stage → job', () => {
    vm.enterScope('pipeline', 'p');
    vm.set('a', '1');
    vm.enterScope('stage', 's');
    vm.set('b', '2');
    vm.enterScope('job', 'j');
    vm.set('c', '3');

    expect(vm.get('a')).toBe('1');
    expect(vm.get('b')).toBe('2');
    expect(vm.get('c')).toBe('3');

    vm.exitScope(); // exit job
    expect(vm.get('a')).toBe('1');
    expect(vm.get('b')).toBe('2');
    expect(vm.get('c')).toBeUndefined();
  });

  // ── Readonly enforcement ──

  it('cannot overwrite a readonly variable', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('locked', 'original', { isReadOnly: true });
    expect(() => vm.set('locked', 'changed')).toThrow('readonly');
  });

  it('cannot overwrite readonly from a child scope', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('locked', 'v1', { isReadOnly: true });
    vm.enterScope('job', 'j');
    expect(() => vm.set('locked', 'v2')).toThrow('readonly');
  });

  // ── Case-insensitive lookup ──

  it('variable lookup is case-insensitive', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('MyVar', 'hello');
    expect(vm.get('myvar')).toBe('hello');
    expect(vm.get('MYVAR')).toBe('hello');
    expect(vm.get('MyVar')).toBe('hello');
  });

  // ── Secret tracking ──

  it('marks and queries secret variables', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('token', 's3cr3t', { isSecret: true });
    expect(vm.isSecret('token')).toBe(true);
    expect(vm.isSecret('unknown')).toBe(false);
  });

  it('registers secrets with the masker', () => {
    const masker = new SecretMasker();
    const vmWithMasker = new VariableManager(masker);
    vmWithMasker.enterScope('pipeline', 'main');
    vmWithMasker.set('key', 'mysecretvalue', { isSecret: true });
    expect(masker.mask('found mysecretvalue here')).toBe('found *** here');
  });

  // ── getResolved ──

  it('getResolved returns full metadata', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('foo', 'bar', { isSecret: true, isReadOnly: true, source: 'group' });
    const resolved = vm.getResolved('foo');
    expect(resolved).toBeDefined();
    expect(resolved!.name).toBe('foo');
    expect(resolved!.value).toBe('bar');
    expect(resolved!.isSecret).toBe(true);
    expect(resolved!.isReadOnly).toBe(true);
    expect(resolved!.source).toBe('group');
    expect(resolved!.scope).toBe('pipeline');
  });

  // ── getAll ──

  it('getAll merges all scopes with inner overriding outer', () => {
    vm.enterScope('pipeline', 'p');
    vm.set('a', '1');
    vm.set('b', '2');
    vm.enterScope('job', 'j');
    vm.set('b', '3'); // override
    vm.set('c', '4');

    const all = vm.getAll();
    expect(all.size).toBe(3);
    expect(all.get('a')!.value).toBe('1');
    expect(all.get('b')!.value).toBe('3');
    expect(all.get('c')!.value).toBe('4');
  });

  // ── toRecord / toEnvironment ──

  it('toRecord returns flat Record<string, string> with original names', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('Pipeline.Name', 'myPipeline');
    vm.set('foo', 'bar');
    const record = vm.toRecord();
    expect(record['Pipeline.Name']).toBe('myPipeline');
    expect(record['foo']).toBe('bar');
  });

  it('toEnvironment converts dots to underscores and uppercases', () => {
    vm.enterScope('pipeline', 'main');
    vm.set('Pipeline.RunId', 'abc-123');
    vm.set('simple', 'value');
    const env = vm.toEnvironment();
    expect(env['PIPELINE_RUNID']).toBe('abc-123');
    expect(env['SIMPLE']).toBe('value');
  });

  // ── loadVariables: inline array ──

  it('loads inline variables from VariableDefinition array', () => {
    vm.enterScope('pipeline', 'main');
    const defs: VariableDefinition[] = [
      { name: 'inlineA', value: 'valueA' },
      { name: 'inlineB', value: 'valueB', readonly: true },
    ];
    vm.loadVariables(defs, 'pipeline');
    expect(vm.get('inlineA')).toBe('valueA');
    expect(vm.get('inlineB')).toBe('valueB');
    const resolved = vm.getResolved('inlineB');
    expect(resolved!.isReadOnly).toBe(true);
  });

  // ── loadVariables: simple key-value map ──

  it('loads variables from a simple Record<string, string>', () => {
    vm.enterScope('pipeline', 'main');
    vm.loadVariables({ x: '1', y: '2' }, 'pipeline');
    expect(vm.get('x')).toBe('1');
    expect(vm.get('y')).toBe('2');
  });

  // ── loadVariables: SimpleVariable in array ──

  it('loads SimpleVariable objects from array', () => {
    vm.enterScope('pipeline', 'main');
    const defs: VariableDefinition[] = [{ MY_VAR: 'myVal' } as VariableDefinition];
    vm.loadVariables(defs, 'pipeline');
    expect(vm.get('MY_VAR')).toBe('myVal');
  });

  // ── loadGroup from YAML ──

  it('loads a variable group from a YAML file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'piperun-test-'));
    const groupDir = join(tempDir, 'groups');
    await mkdir(groupDir, { recursive: true });

    const yamlContent = `MY_VAR: value1\nANOTHER_VAR: value2\nSECRET_KEY:\n  value: s3cr3t\n  isSecret: true\n`;
    await writeFile(join(groupDir, 'myGroup.yaml'), yamlContent, 'utf-8');

    vm.enterScope('pipeline', 'main');
    await vm.loadGroup('myGroup', [groupDir]);

    expect(vm.get('MY_VAR')).toBe('value1');
    expect(vm.get('ANOTHER_VAR')).toBe('value2');
    expect(vm.get('SECRET_KEY')).toBe('s3cr3t');
    expect(vm.isSecret('SECRET_KEY')).toBe(true);
    expect(vm.isSecret('MY_VAR')).toBe(false);
  });

  it('throws when variable group is not found', async () => {
    vm.enterScope('pipeline', 'main');
    await expect(
      vm.loadGroup('nonexistent', ['/tmp/does-not-exist']),
    ).rejects.toThrow("Variable group 'nonexistent' not found");
  });

  it('loads numeric and boolean values from YAML as strings', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'piperun-test-'));
    const groupDir = join(tempDir, 'groups');
    await mkdir(groupDir, { recursive: true });

    const yamlContent = `PORT: 3000\nDEBUG: true\n`;
    await writeFile(join(groupDir, 'numGroup.yaml'), yamlContent, 'utf-8');

    vm.enterScope('pipeline', 'main');
    await vm.loadGroup('numGroup', [groupDir]);

    expect(vm.get('PORT')).toBe('3000');
    expect(vm.get('DEBUG')).toBe('true');
  });

  // ── System variables ──

  it('initializes system variables at pipeline scope', () => {
    vm.enterScope('pipeline', 'main');
    vm.initializeSystemVariables({
      runId: 'run-42',
      runNumber: 42,
      pipelineName: 'myPipeline',
      workspace: '/work',
      stageName: 'build',
      jobName: 'compile',
      stepName: 'npm install',
    });

    expect(vm.get('Pipeline.RunId')).toBe('run-42');
    expect(vm.get('Pipeline.RunNumber')).toBe('42');
    expect(vm.get('Pipeline.Name')).toBe('myPipeline');
    expect(vm.get('Pipeline.Workspace')).toBe('/work');
    expect(vm.get('Stage.Name')).toBe('build');
    expect(vm.get('Job.Name')).toBe('compile');
    expect(vm.get('Step.Name')).toBe('npm install');
    expect(vm.get('Agent.OS')).toBeDefined();
    expect(vm.get('Agent.MachineName')).toBeDefined();
    expect(vm.get('Agent.HomeDirectory')).toBeDefined();
    expect(vm.get('Agent.TempDirectory')).toBeDefined();
    expect(vm.get('Agent.WorkFolder')).toBe('/work');
  });

  it('system variables are readonly', () => {
    vm.enterScope('pipeline', 'main');
    vm.initializeSystemVariables({
      runId: 'r1',
      runNumber: 1,
      pipelineName: 'p',
      workspace: '/w',
    });
    expect(() => vm.set('Pipeline.RunId', 'changed')).toThrow('readonly');
  });

  // ── createScope (legacy API) ──

  it('createScope pushes a scope onto the stack', () => {
    vm.createScope('pipeline');
    vm.set('x', '1');
    expect(vm.get('x')).toBe('1');
    expect(vm.currentScope).toBe('pipeline');
  });

  // ── currentScope ──

  it('currentScope reflects the top of the stack', () => {
    expect(vm.currentScope).toBeUndefined();
    vm.enterScope('pipeline', 'p');
    expect(vm.currentScope).toBe('pipeline');
    vm.enterScope('stage', 's');
    expect(vm.currentScope).toBe('stage');
    vm.exitScope();
    expect(vm.currentScope).toBe('pipeline');
  });

  // ── Settable variables restrictions ──

  it('isSettable returns true when no restrictions', () => {
    expect(vm.isSettable('anything')).toBe(true);
  });

  it('isSettable returns false when none: true', () => {
    expect(vm.isSettable('anything', { none: true })).toBe(false);
  });

  it('isSettable checks allowed list case-insensitively', () => {
    const restrictions = { allowed: ['AllowedVar', 'Other'] };
    expect(vm.isSettable('allowedvar', restrictions)).toBe(true);
    expect(vm.isSettable('ALLOWEDVAR', restrictions)).toBe(true);
    expect(vm.isSettable('Other', restrictions)).toBe(true);
    expect(vm.isSettable('denied', restrictions)).toBe(false);
  });

  it('isSettable with empty allowed list denies all', () => {
    expect(vm.isSettable('anything', { allowed: [] })).toBe(false);
  });

  // ── getSecretMasker ──

  it('getSecretMasker returns the associated masker', () => {
    const masker = new SecretMasker();
    const vmWithMasker = new VariableManager(masker);
    expect(vmWithMasker.getSecretMasker()).toBe(masker);
  });

  it('creates a default masker when none provided', () => {
    expect(vm.getSecretMasker()).toBeDefined();
  });

  // ── Set variable at a specific scope ──

  it('set with explicit scope targets that scope level', () => {
    vm.enterScope('pipeline', 'p');
    vm.enterScope('job', 'j');
    vm.set('pipelineVar', 'pv', { scope: 'pipeline' });

    // Should be visible from the job scope
    expect(vm.get('pipelineVar')).toBe('pv');

    // After exiting job scope, should still be visible at pipeline
    vm.exitScope();
    expect(vm.get('pipelineVar')).toBe('pv');
  });

  // ── resolveRuntimeExpressions ──

  it('resolves $[...] expressions in current scope variables', () => {
    vm.enterScope('job', 'j');
    vm.set('mapped', '$[dependencies.JobA.result]', { source: 'inline' });
    vm.set('plain', 'no-expression', { source: 'inline' });

    vm.resolveRuntimeExpressions((value) => {
      if (value === '$[dependencies.JobA.result]') return 'Succeeded';
      return value;
    });

    expect(vm.get('mapped')).toBe('Succeeded');
    expect(vm.get('plain')).toBe('no-expression');
  });

  it('does not call resolver for variables without $[', () => {
    vm.enterScope('job', 'j');
    vm.set('noExpr', 'just a string');
    const resolver = vi.fn();

    vm.resolveRuntimeExpressions(resolver);

    expect(resolver).not.toHaveBeenCalled();
    expect(vm.get('noExpr')).toBe('just a string');
  });

  it('preserves original value when resolver returns same string', () => {
    vm.enterScope('job', 'j');
    vm.set('expr', '$[unknown.thing]', { source: 'inline' });

    vm.resolveRuntimeExpressions((value) => value);

    expect(vm.get('expr')).toBe('$[unknown.thing]');
  });

  it('is a no-op when no scopes exist', () => {
    expect(() =>
      vm.resolveRuntimeExpressions(() => 'resolved'),
    ).not.toThrow();
  });
});

// ─── OutputVariableStore ────────────────────────────────────────────────────────

describe('OutputVariableStore', () => {
  let store: OutputVariableStore;

  beforeEach(() => {
    store = new OutputVariableStore();
  });

  it('sets and gets an output variable', () => {
    store.setOutput('jobA', 'step1', 'result', 'success');
    expect(store.getOutput('jobA', 'step1.result')).toBe('success');
  });

  it('returns undefined for non-existent output', () => {
    expect(store.getOutput('nope', 'step.var')).toBeUndefined();
  });

  it('overwrites an existing output', () => {
    store.setOutput('j', 's', 'v', 'first');
    store.setOutput('j', 's', 'v', 'second');
    expect(store.getOutput('j', 's.v')).toBe('second');
  });

  it('tracks secret flag on outputs', () => {
    store.setOutput('j', 's', 'token', 'abc', true);
    expect(store.isOutputSecret('j', 's.token')).toBe(true);
    store.setOutput('j', 's', 'name', 'public', false);
    expect(store.isOutputSecret('j', 's.name')).toBe(false);
    expect(store.isOutputSecret('j', 'nonexist')).toBe(false);
  });

  it('getJobOutputs returns all outputs for a job', () => {
    store.setOutput('job1', 'stepA', 'x', '1');
    store.setOutput('job1', 'stepA', 'y', '2');
    store.setOutput('job1', 'stepB', 'z', '3');
    const outputs = store.getJobOutputs('job1');
    expect(outputs).toEqual({
      'stepA.x': '1',
      'stepA.y': '2',
      'stepB.z': '3',
    });
  });

  it('getJobOutputs returns empty object for unknown job', () => {
    expect(store.getJobOutputs('unknown')).toEqual({});
  });

  it('tracks job results', () => {
    store.setJobResult('job1', 'Succeeded');
    store.setJobResult('job2', 'Failed');
    expect(store.getJobResult('job1')).toBe('Succeeded');
    expect(store.getJobResult('job2')).toBe('Failed');
    expect(store.getJobResult('unknown')).toBeUndefined();
  });

  it('buildDependencyContext returns combined results and outputs', () => {
    store.setJobResult('build', 'Succeeded');
    store.setOutput('build', 'compile', 'artifact', 'app.zip');
    store.setOutput('build', 'compile', 'hash', 'abc123');
    store.setJobResult('test', 'Failed');

    const ctx = store.buildDependencyContext();
    expect(ctx['build']).toEqual({
      result: 'Succeeded',
      outputs: {
        'compile.artifact': 'app.zip',
        'compile.hash': 'abc123',
      },
    });
    expect(ctx['test']).toEqual({
      result: 'Failed',
      outputs: {},
    });
  });

  it('buildDependencyContext defaults result to Succeeded for jobs with only outputs', () => {
    store.setOutput('deploy', 'step1', 'url', 'https://example.com');
    const ctx = store.buildDependencyContext();
    expect(ctx['deploy'].result).toBe('Succeeded');
  });

  // ── Cross-stage outputs ──

  it('sets and retrieves stage-level outputs', () => {
    store.setStageLevelOutput('build', 'compile', 'step1', 'artifact', 'app.zip');
    store.setStageLevelJobResult('build', 'compile', 'Succeeded');

    const ctx = store.buildStageDependencyContext();
    expect(ctx['build']['compile']).toEqual({
      result: 'Succeeded',
      outputs: { 'step1.artifact': 'app.zip' },
    });
  });

  it('buildStageDependencyContext handles multiple stages', () => {
    store.setStageLevelJobResult('build', 'job1', 'Succeeded');
    store.setStageLevelOutput('build', 'job1', 's1', 'v1', 'val1');
    store.setStageLevelJobResult('test', 'job2', 'Failed');
    store.setStageLevelOutput('test', 'job2', 's2', 'v2', 'val2');

    const ctx = store.buildStageDependencyContext();
    expect(Object.keys(ctx)).toHaveLength(2);
    expect(ctx['build']['job1'].result).toBe('Succeeded');
    expect(ctx['build']['job1'].outputs['s1.v1']).toBe('val1');
    expect(ctx['test']['job2'].result).toBe('Failed');
    expect(ctx['test']['job2'].outputs['s2.v2']).toBe('val2');
  });

  it('buildStageDependencyContext defaults result for jobs with only outputs', () => {
    store.setStageLevelOutput('deploy', 'releaseJob', 'publish', 'url', 'https://prod.com');
    const ctx = store.buildStageDependencyContext();
    expect(ctx['deploy']['releaseJob'].result).toBe('Succeeded');
  });

  it('buildStageDependencyContext returns empty for no data', () => {
    expect(store.buildStageDependencyContext()).toEqual({});
  });
});

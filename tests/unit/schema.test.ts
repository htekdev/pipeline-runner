import { describe, it, expect } from 'vitest';
import {
  pwshStepSchema,
  nodeStepSchema,
  pythonStepSchema,
  taskStepSchema,
  stepSchema,
  stepTemplateSchema,
  parameterSchema,
  poolSchema,
  jobStrategySchema,
  regularJobSchema,
  deploymentJobSchema,
  jobTemplateSchema,
  jobSchema,
  stageSchema,
  pipelineSchema,
  variablesSchema,
  variableDefinitionSchema,
  inlineVariableSchema,
  variableGroupSchema,
  variableTemplateSchema,
  resourcesSchema,
  repositoryResourceSchema,
  containerResourceSchema,
  pipelineResourceSchema,
  deploymentStrategySchema,
  lifecycleHookSchema,
  environmentSchema,
  containerReferenceSchema,
  workspaceSchema,
  usesSchema,
  extendsSchema,
} from '../../src/parser/schema.js';

describe('schema', () => {
  describe('step schemas', () => {
    it('should parse a pwsh step', () => {
      const result = pwshStepSchema.safeParse({
        pwsh: 'Write-Host "hi"',
        displayName: 'Say hi',
      });
      expect(result.success).toBe(true);
    });

    it('should reject pwsh step with non-string value', () => {
      const result = pwshStepSchema.safeParse({ pwsh: 123 });
      expect(result.success).toBe(false);
    });

    it('should parse a node step', () => {
      const result = nodeStepSchema.safeParse({
        node: 'console.log("hi")',
        displayName: 'Node',
      });
      expect(result.success).toBe(true);
    });

    it('should reject node step with non-string value', () => {
      const result = nodeStepSchema.safeParse({ node: true });
      expect(result.success).toBe(false);
    });

    it('should parse a python step', () => {
      const result = pythonStepSchema.safeParse({
        python: 'print("hi")',
        displayName: 'Python',
      });
      expect(result.success).toBe(true);
    });

    it('should reject python step with non-string value', () => {
      const result = pythonStepSchema.safeParse({ python: [] });
      expect(result.success).toBe(false);
    });

    it('should parse a task step', () => {
      const result = taskStepSchema.safeParse({
        task: 'MyTask@1',
        inputs: { key: 'val' },
      });
      expect(result.success).toBe(true);
    });

    it('should parse a task step without inputs', () => {
      const result = taskStepSchema.safeParse({ task: 'MyTask@1' });
      expect(result.success).toBe(true);
    });

    it('should parse a step with all optional properties', () => {
      const result = stepSchema.safeParse({
        pwsh: 'echo test',
        displayName: 'Test',
        name: 'testStep',
        condition: 'succeeded()',
        enabled: true,
        continueOnError: false,
        timeoutInMinutes: 5,
        retryCountOnTaskFailure: 2,
        env: { FOO: 'bar' },
      });
      expect(result.success).toBe(true);
    });

    it('should parse a step template reference', () => {
      const result = stepSchema.safeParse({
        template: 'templates/steps.yaml',
        parameters: { env: 'prod' },
      });
      expect(result.success).toBe(true);
    });

    it('should parse a step template without parameters', () => {
      const result = stepTemplateSchema.safeParse({
        template: 'templates/steps.yaml',
      });
      expect(result.success).toBe(true);
    });

    it('should parse a step with target as string', () => {
      const result = stepSchema.safeParse({
        pwsh: 'echo test',
        target: 'host',
      });
      expect(result.success).toBe(true);
    });

    it('should parse a step with target as object', () => {
      const result = stepSchema.safeParse({
        pwsh: 'echo test',
        target: {
          container: 'my-container',
          settableVariables: ['var1', 'var2'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should parse a step with target settableVariables none', () => {
      const result = stepSchema.safeParse({
        pwsh: 'echo test',
        target: { settableVariables: { none: true } },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty object as step (no step type key)', () => {
      const result = stepSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should parse pwsh step with only required field', () => {
      const result = pwshStepSchema.safeParse({ pwsh: 'echo hello' });
      expect(result.success).toBe(true);
    });

    it('should parse step with env as empty record', () => {
      const result = stepSchema.safeParse({ pwsh: 'echo', env: {} });
      expect(result.success).toBe(true);
    });
  });

  describe('parameter schema', () => {
    it('should parse valid parameter types', () => {
      const types = [
        'string',
        'number',
        'boolean',
        'object',
        'step',
        'stepList',
        'job',
        'jobList',
        'stage',
        'stageList',
      ];
      for (const type of types) {
        const result = parameterSchema.safeParse({ name: 'test', type });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid parameter type', () => {
      const result = parameterSchema.safeParse({
        name: 'test',
        type: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should parse parameter with allowed values', () => {
      const result = parameterSchema.safeParse({
        name: 'env',
        type: 'string',
        default: 'dev',
        displayName: 'Environment',
        values: ['dev', 'staging', 'prod'],
      });
      expect(result.success).toBe(true);
    });

    it('should parse parameter without default or values', () => {
      const result = parameterSchema.safeParse({
        name: 'input',
        type: 'string',
      });
      expect(result.success).toBe(true);
    });

    it('should reject parameter missing name', () => {
      const result = parameterSchema.safeParse({ type: 'string' });
      expect(result.success).toBe(false);
    });

    it('should reject parameter missing type', () => {
      const result = parameterSchema.safeParse({ name: 'test' });
      expect(result.success).toBe(false);
    });

    it('should parse parameter with boolean default', () => {
      const result = parameterSchema.safeParse({
        name: 'debug',
        type: 'boolean',
        default: false,
      });
      expect(result.success).toBe(true);
    });

    it('should parse parameter with object default', () => {
      const result = parameterSchema.safeParse({
        name: 'config',
        type: 'object',
        default: { key: 'value' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('pool schema', () => {
    it('should parse string pool', () => {
      const result = poolSchema.safeParse('my-pool');
      expect(result.success).toBe(true);
    });

    it('should parse object pool with vmImage', () => {
      const result = poolSchema.safeParse({ vmImage: 'ubuntu-latest' });
      expect(result.success).toBe(true);
    });

    it('should parse object pool with demands array', () => {
      const result = poolSchema.safeParse({
        name: 'my-pool',
        demands: ['docker', 'node18'],
      });
      expect(result.success).toBe(true);
    });

    it('should parse object pool with single demand string', () => {
      const result = poolSchema.safeParse({ name: 'pool', demands: 'docker' });
      expect(result.success).toBe(true);
    });

    it('should parse empty object pool', () => {
      const result = poolSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject pool with numeric value', () => {
      const result = poolSchema.safeParse(42);
      expect(result.success).toBe(false);
    });
  });

  describe('job strategy schema', () => {
    it('should parse matrix strategy', () => {
      const result = jobStrategySchema.safeParse({
        matrix: {
          linux: { os: 'linux' },
          windows: { os: 'windows' },
        },
        maxParallel: 2,
      });
      expect(result.success).toBe(true);
    });

    it('should parse parallel strategy', () => {
      const result = jobStrategySchema.safeParse({ parallel: 4 });
      expect(result.success).toBe(true);
    });

    it('should parse empty strategy', () => {
      const result = jobStrategySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should parse strategy with only maxParallel', () => {
      const result = jobStrategySchema.safeParse({ maxParallel: 3 });
      expect(result.success).toBe(true);
    });

    it('should reject parallel with non-number', () => {
      const result = jobStrategySchema.safeParse({ parallel: 'four' });
      expect(result.success).toBe(false);
    });
  });

  describe('job schemas', () => {
    it('should parse a regular job', () => {
      const result = regularJobSchema.safeParse({
        job: 'Build',
        displayName: 'Build Job',
        pool: { vmImage: 'ubuntu-latest' },
        steps: [{ pwsh: 'npm run build' }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse a minimal regular job', () => {
      const result = regularJobSchema.safeParse({
        job: 'Build',
        steps: [{ pwsh: 'echo hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should reject a regular job without steps', () => {
      const result = regularJobSchema.safeParse({
        job: 'Build',
      });
      expect(result.success).toBe(false);
    });

    it('should parse a regular job with dependsOn as string', () => {
      const result = regularJobSchema.safeParse({
        job: 'Test',
        dependsOn: 'Build',
        steps: [{ pwsh: 'echo test' }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse a regular job with dependsOn as array', () => {
      const result = regularJobSchema.safeParse({
        job: 'Deploy',
        dependsOn: ['Build', 'Test'],
        steps: [{ pwsh: 'echo deploy' }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse a regular job with all optional fields', () => {
      const result = regularJobSchema.safeParse({
        job: 'Full',
        displayName: 'Full Job',
        dependsOn: 'Build',
        condition: 'succeeded()',
        continueOnError: true,
        timeoutInMinutes: 60,
        cancelTimeoutInMinutes: 5,
        variables: { var1: 'val1' },
        pool: { vmImage: 'ubuntu-latest' },
        container: 'node:20',
        strategy: { parallel: 2 },
        workspace: { clean: 'all' },
        uses: { repositories: ['self'] },
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse a deployment job', () => {
      const result = deploymentJobSchema.safeParse({
        deployment: 'Deploy',
        environment: 'production',
        strategy: {
          runOnce: {
            deploy: { steps: [{ pwsh: 'echo deploying' }] },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should parse a deployment job with canary strategy', () => {
      const result = deploymentJobSchema.safeParse({
        deployment: 'Deploy',
        environment: { name: 'production', resourceName: 'web' },
        strategy: {
          canary: {
            increments: [10, 50, 100],
            deploy: { steps: [{ pwsh: 'echo canary' }] },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should parse a deployment job with rolling strategy', () => {
      const result = deploymentJobSchema.safeParse({
        deployment: 'Deploy',
        environment: 'staging',
        strategy: {
          rolling: {
            maxParallel: 2,
            deploy: { steps: [{ pwsh: 'echo rolling' }] },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject a deployment job without environment', () => {
      const result = deploymentJobSchema.safeParse({
        deployment: 'Deploy',
        strategy: {
          runOnce: {
            deploy: { steps: [{ pwsh: 'echo' }] },
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject a deployment job without strategy', () => {
      const result = deploymentJobSchema.safeParse({
        deployment: 'Deploy',
        environment: 'production',
      });
      expect(result.success).toBe(false);
    });

    it('should parse a job template', () => {
      const result = jobTemplateSchema.safeParse({
        template: 'templates/job.yaml',
        parameters: { env: 'dev' },
      });
      expect(result.success).toBe(true);
    });

    it('should discriminate job types via union', () => {
      const regular = jobSchema.safeParse({
        job: 'Build',
        steps: [{ pwsh: 'echo' }],
      });
      expect(regular.success).toBe(true);

      const deployment = jobSchema.safeParse({
        deployment: 'Deploy',
        environment: 'prod',
        strategy: { runOnce: {} },
      });
      expect(deployment.success).toBe(true);

      const template = jobSchema.safeParse({
        template: 'jobs/template.yaml',
      });
      expect(template.success).toBe(true);
    });
  });

  describe('stage schema', () => {
    it('should parse a stage with jobs', () => {
      const result = stageSchema.safeParse({
        stage: 'Build',
        displayName: 'Build Stage',
        jobs: [{ job: 'BuildApp', steps: [{ pwsh: 'echo build' }] }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse a stage with dependsOn as string', () => {
      const result = stageSchema.safeParse({
        stage: 'Deploy',
        dependsOn: 'Build',
        jobs: [{ job: 'DeployApp', steps: [{ pwsh: 'echo deploy' }] }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse a stage with dependsOn as array', () => {
      const result = stageSchema.safeParse({
        stage: 'Deploy',
        dependsOn: ['Build', 'Test'],
        condition: 'succeeded()',
        jobs: [{ job: 'DeployApp', steps: [{ pwsh: 'echo deploy' }] }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse a stage template', () => {
      const result = stageSchema.safeParse({
        template: 'templates/stages.yaml',
        parameters: { env: 'dev' },
      });
      expect(result.success).toBe(true);
    });

    it('should parse a stage without jobs', () => {
      const result = stageSchema.safeParse({
        stage: 'Empty',
      });
      expect(result.success).toBe(true);
    });

    it('should parse a stage with lockBehavior', () => {
      const result = stageSchema.safeParse({
        stage: 'Deploy',
        lockBehavior: 'sequential',
        jobs: [{ job: 'A', steps: [{ pwsh: 'echo' }] }],
      });
      expect(result.success).toBe(true);
    });

    it('should reject stage with invalid lockBehavior', () => {
      const result = stageSchema.safeParse({
        stage: 'Deploy',
        lockBehavior: 'invalid',
        jobs: [{ job: 'A', steps: [{ pwsh: 'echo' }] }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('variables schema', () => {
    it('should parse array of variable definitions', () => {
      const result = variablesSchema.safeParse([
        { name: 'var1', value: 'value1' },
        { group: 'my-group' },
        { template: 'templates/vars.yaml' },
      ]);
      expect(result.success).toBe(true);
    });

    it('should parse record/map of variables', () => {
      const result = variablesSchema.safeParse({
        key1: 'val1',
        key2: 'val2',
      });
      expect(result.success).toBe(true);
    });

    it('should parse empty record of variables', () => {
      const result = variablesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should parse inline variable with readonly', () => {
      const result = inlineVariableSchema.safeParse({
        name: 'config',
        value: 'Release',
        readonly: true,
      });
      expect(result.success).toBe(true);
    });

    it('should parse variable group', () => {
      const result = variableGroupSchema.safeParse({ group: 'my-vars' });
      expect(result.success).toBe(true);
    });

    it('should parse variable template', () => {
      const result = variableTemplateSchema.safeParse({
        template: 'vars/common.yaml',
        parameters: { env: 'dev' },
      });
      expect(result.success).toBe(true);
    });

    it('should discriminate variable definition types', () => {
      const inline = variableDefinitionSchema.safeParse({
        name: 'v',
        value: 'x',
      });
      expect(inline.success).toBe(true);

      const group = variableDefinitionSchema.safeParse({ group: 'g' });
      expect(group.success).toBe(true);

      const template = variableDefinitionSchema.safeParse({
        template: 't.yaml',
      });
      expect(template.success).toBe(true);
    });
  });

  describe('resources schema', () => {
    it('should parse repository resources', () => {
      const result = resourcesSchema.safeParse({
        repositories: [
          {
            repository: 'common',
            type: 'github',
            name: 'org/repo',
            ref: 'main',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should parse container resources', () => {
      const result = resourcesSchema.safeParse({
        containers: [
          {
            container: 'node',
            image: 'node:20',
            env: { NODE_ENV: 'production' },
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should parse pipeline resources', () => {
      const result = resourcesSchema.safeParse({
        pipelines: [
          { pipeline: 'other', source: './other-pipeline.yaml' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should parse empty resources object', () => {
      const result = resourcesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should parse repository resource with type git', () => {
      const result = repositoryResourceSchema.safeParse({
        repository: 'common',
        type: 'git',
        name: 'repo',
      });
      expect(result.success).toBe(true);
    });

    it('should reject repository resource with invalid type', () => {
      const result = repositoryResourceSchema.safeParse({
        repository: 'common',
        type: 'svn',
        name: 'repo',
      });
      expect(result.success).toBe(false);
    });

    it('should parse repository resource with endpoint', () => {
      const result = repositoryResourceSchema.safeParse({
        repository: 'common',
        type: 'github',
        name: 'org/repo',
        ref: 'main',
        endpoint: 'github-connection',
      });
      expect(result.success).toBe(true);
    });

    it('should parse container resource with all options', () => {
      const result = containerResourceSchema.safeParse({
        container: 'build',
        image: 'node:20',
        options: '--privileged',
        env: { CI: 'true' },
        ports: ['8080:80'],
        volumes: ['/data:/data'],
        mountReadOnly: { work: true, externals: false },
      });
      expect(result.success).toBe(true);
    });

    it('should parse pipeline resource with project and version', () => {
      const result = pipelineResourceSchema.safeParse({
        pipeline: 'upstream',
        source: 'build-pipeline',
        project: 'my-project',
        version: '1.0',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('deployment strategy schema', () => {
    it('should parse runOnce with all lifecycle hooks', () => {
      const result = deploymentStrategySchema.safeParse({
        runOnce: {
          preDeploy: { steps: [{ pwsh: 'echo pre' }] },
          deploy: { steps: [{ pwsh: 'echo deploy' }] },
          routeTraffic: { steps: [{ pwsh: 'echo route' }] },
          postRouteTraffic: { steps: [{ pwsh: 'echo post' }] },
          on: {
            success: { steps: [{ pwsh: 'echo success' }] },
            failure: { steps: [{ pwsh: 'echo failure' }] },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should parse rolling with maxParallel as number', () => {
      const result = deploymentStrategySchema.safeParse({
        rolling: {
          maxParallel: 5,
          deploy: { steps: [{ pwsh: 'echo rolling' }] },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should parse rolling with maxParallel as string', () => {
      const result = deploymentStrategySchema.safeParse({
        rolling: {
          maxParallel: '50%',
          deploy: { steps: [{ pwsh: 'echo rolling' }] },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should parse canary with increments', () => {
      const result = deploymentStrategySchema.safeParse({
        canary: {
          increments: [10, 25, 50, 100],
          deploy: { steps: [{ pwsh: 'echo canary' }] },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should parse empty deployment strategy', () => {
      const result = deploymentStrategySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('lifecycle hook schema', () => {
    it('should parse hook with steps only', () => {
      const result = lifecycleHookSchema.safeParse({
        steps: [{ pwsh: 'echo hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse hook with steps and pool', () => {
      const result = lifecycleHookSchema.safeParse({
        steps: [{ pwsh: 'echo hello' }],
        pool: { vmImage: 'ubuntu-latest' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject hook without steps', () => {
      const result = lifecycleHookSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('environment schema', () => {
    it('should parse string environment', () => {
      const result = environmentSchema.safeParse('production');
      expect(result.success).toBe(true);
    });

    it('should parse object environment', () => {
      const result = environmentSchema.safeParse({
        name: 'production',
        resourceName: 'web-app',
        resourceType: 'virtualMachine',
      });
      expect(result.success).toBe(true);
    });

    it('should reject environment object without name', () => {
      const result = environmentSchema.safeParse({ resourceName: 'web' });
      expect(result.success).toBe(false);
    });
  });

  describe('container reference schema', () => {
    it('should parse string container', () => {
      const result = containerReferenceSchema.safeParse('node:20');
      expect(result.success).toBe(true);
    });

    it('should parse object container', () => {
      const result = containerReferenceSchema.safeParse({
        image: 'node:20',
        env: { CI: 'true' },
        ports: ['3000:3000'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject object container without image', () => {
      const result = containerReferenceSchema.safeParse({
        env: { CI: 'true' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('workspace schema', () => {
    it('should parse valid clean values', () => {
      for (const clean of ['outputs', 'resources', 'all'] as const) {
        const result = workspaceSchema.safeParse({ clean });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid clean value', () => {
      const result = workspaceSchema.safeParse({ clean: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should parse empty workspace', () => {
      const result = workspaceSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('uses schema', () => {
    it('should parse uses with repositories', () => {
      const result = usesSchema.safeParse({
        repositories: ['self', 'common'],
      });
      expect(result.success).toBe(true);
    });

    it('should parse uses with pools', () => {
      const result = usesSchema.safeParse({ pools: ['default'] });
      expect(result.success).toBe(true);
    });

    it('should parse empty uses', () => {
      const result = usesSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('extends schema', () => {
    it('should parse extends with template', () => {
      const result = extendsSchema.safeParse({
        template: 'base.yaml',
      });
      expect(result.success).toBe(true);
    });

    it('should parse extends with parameters', () => {
      const result = extendsSchema.safeParse({
        template: 'base.yaml',
        parameters: { env: 'prod', debug: true },
      });
      expect(result.success).toBe(true);
    });

    it('should reject extends without template', () => {
      const result = extendsSchema.safeParse({ parameters: { x: 1 } });
      expect(result.success).toBe(false);
    });
  });

  describe('full pipeline schema', () => {
    it('should parse a minimal pipeline', () => {
      const result = pipelineSchema.safeParse({
        steps: [{ pwsh: 'echo hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse a pipeline with name only', () => {
      const result = pipelineSchema.safeParse({ name: 'Empty' });
      // Schema allows it; semantic validation catches missing content
      expect(result.success).toBe(true);
    });

    it('should parse appendCommitMessageToRunName', () => {
      const result = pipelineSchema.safeParse({
        appendCommitMessageToRunName: true,
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(true);
    });

    it('should parse lockBehavior at pipeline level', () => {
      const result = pipelineSchema.safeParse({
        lockBehavior: 'runLatest',
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid lockBehavior at pipeline level', () => {
      const result = pipelineSchema.safeParse({
        lockBehavior: 'invalid',
        steps: [{ pwsh: 'echo' }],
      });
      expect(result.success).toBe(false);
    });

    it('should parse a full-featured pipeline', () => {
      const result = pipelineSchema.safeParse({
        name: 'Full Pipeline',
        parameters: [{ name: 'env', type: 'string', default: 'dev' }],
        variables: [{ name: 'config', value: 'Release' }],
        pool: { vmImage: 'ubuntu-latest' },
        resources: {
          repositories: [
            { repository: 'common', type: 'git', name: 'common-repo' },
          ],
        },
        stages: [
          {
            stage: 'Build',
            jobs: [
              {
                job: 'BuildApp',
                strategy: {
                  matrix: { linux: { os: 'linux' } },
                  maxParallel: 2,
                },
                steps: [
                  { pwsh: 'npm run build', displayName: 'Build' },
                  { node: 'console.log("done")', condition: 'succeeded()' },
                ],
              },
            ],
          },
          {
            stage: 'Deploy',
            dependsOn: 'Build',
            jobs: [
              {
                deployment: 'DeployApp',
                environment: 'production',
                strategy: {
                  runOnce: {
                    preDeploy: { steps: [{ pwsh: 'echo pre-deploy' }] },
                    deploy: { steps: [{ pwsh: 'echo deploy' }] },
                    on: {
                      success: { steps: [{ pwsh: 'echo success' }] },
                      failure: { steps: [{ pwsh: 'echo failure' }] },
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

    it('should parse pipeline with extends and nothing else', () => {
      const result = pipelineSchema.safeParse({
        extends: { template: 'base.yaml', parameters: { x: 1 } },
      });
      expect(result.success).toBe(true);
    });

    it('should accept passthrough properties', () => {
      const result = pipelineSchema.safeParse({
        steps: [{ pwsh: 'echo' }],
        customProperty: 'allowed by passthrough',
      });
      expect(result.success).toBe(true);
    });
  });
});

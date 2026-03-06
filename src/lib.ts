// piperun — public API for programmatic use

// Core types
export type {
  PipelineDefinition,
  StageDefinition,
  JobDefinition,
  RegularJobDefinition,
  DeploymentJobDefinition,
  StepDefinition,
  PwshStep,
  NodeStep,
  PythonStep,
  TaskStep,
  ParameterDefinition,
  JobStrategy,
  DeploymentStrategy,
  PoolDefinition,
  PipelineRunContext,
  PipelineStatus,
} from './types/pipeline.js';

export type {
  ExpressionContext,
  ExpressionResult,
  Expression,
} from './types/expressions.js';

export type {
  VariableDefinition,
  ResolvedVariable,
  VariableScope,
} from './types/variables.js';

// Parser
export { loadPipeline, loadYamlFile, resolveTemplatePath } from './parser/yaml-loader.js';
export { validatePipeline } from './parser/validator.js';
export { pipelineSchema } from './parser/schema.js';

// Compiler
export { PipelineCompiler } from './compiler/pipeline-compiler.js';
export { ParameterResolver } from './compiler/parameter-resolver.js';
export { createExpressionEngine } from './compiler/expression-engine.js';
export type { ExpressionEngine, FunctionRegistry } from './compiler/expression-engine.js';
export { TemplateEngine } from './compiler/template-engine.js';

// Runtime
export { PipelineRunner } from './runtime/pipeline-runner.js';
export type { PipelineRunOptions, PipelineRunResult } from './runtime/pipeline-runner.js';
export { StepRunner } from './runtime/step-runner.js';
export type { StepResult, StepRunnerOptions } from './runtime/step-runner.js';
export { ConditionEvaluator } from './runtime/condition-evaluator.js';
export { DependencyGraph } from './runtime/dependency-graph.js';
export { StrategyRunner } from './runtime/strategy-runner.js';
export { DeploymentRunner } from './runtime/deployment-runner.js';
export { PoolResolver } from './runtime/pool-resolver.js';
export { WorkspaceManager } from './runtime/workspace-manager.js';

// Variables
export { VariableManager } from './variables/variable-manager.js';
export { OutputVariableStore } from './variables/output-variables.js';
export { SecretMasker } from './variables/secret-masker.js';

// Functions
export { createFunctionRegistry } from './functions/index.js';
export type { StatusContext } from './functions/types.js';

// Artifacts
export { ArtifactManager } from './artifacts/artifact-manager.js';
export { CacheManager } from './artifacts/cache-manager.js';

// Logging
export { parseLoggingCommand, formatLoggingCommand } from './logging/command-parser.js';
export { createCommandRegistry } from './logging/commands/index.js';

// Security
export { ExtendsEnforcer } from './security/extends-enforcer.js';
export { DecoratorEngine } from './security/decorator-engine.js';
export { VariableGuard } from './security/variable-guard.js';

// Approvals
export { ManualApproval } from './approvals/manual-approval.js';
export { ExclusiveLock } from './approvals/exclusive-lock.js';

// Environments
export { EnvironmentManager } from './environments/environment-manager.js';
export { DeploymentHistoryWriter } from './environments/deployment-history.js';

// Resources
export { ServiceConnectionManager } from './resources/service-connections.js';

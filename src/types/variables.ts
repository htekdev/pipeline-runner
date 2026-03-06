// Variable definition types — support inline, group, and template references

export type VariableDefinition =
  | InlineVariable
  | VariableGroupReference
  | VariableTemplateReference
  | SimpleVariable;

export interface InlineVariable {
  name: string;
  value: string;
  readonly?: boolean;
}

export interface VariableGroupReference {
  group: string;
}

export interface VariableTemplateReference {
  template: string;
  parameters?: Record<string, unknown>;
}

/** Shorthand syntax: `variables: { key: value }` */
export interface SimpleVariable {
  [key: string]: string;
}

// Variable scope levels
export type VariableScope = 'pipeline' | 'stage' | 'job';

// Variable with metadata after resolution
export interface ResolvedVariable {
  name: string;
  value: string;
  scope: VariableScope;
  isSecret: boolean;
  isOutput: boolean;
  isReadOnly: boolean;
  source: 'inline' | 'group' | 'template' | 'system' | 'output' | 'parameter';
}

// System/predefined variable categories
export interface SystemVariables {
  'Pipeline.RunId': string;
  'Pipeline.RunNumber': string;
  'Pipeline.Name': string;
  'Pipeline.Workspace': string;
  'Stage.Name': string;
  'Stage.Attempt': string;
  'Job.Name': string;
  'Job.Attempt': string;
  'Step.Name': string;
  'Agent.OS': string;
  'Agent.MachineName': string;
  'Agent.HomeDirectory': string;
  'Agent.TempDirectory': string;
  'Agent.WorkFolder': string;
  [key: string]: string;
}

// Settable variables restriction
export interface SettableVariablesConfig {
  none?: boolean;
  allowed?: string[];
}

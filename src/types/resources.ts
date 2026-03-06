// Resource definitions for the pipeline runner

export interface ResourcesDefinition {
  pipelines?: PipelineResourceDefinition[];
  repositories?: RepositoryResourceDefinition[];
  containers?: ContainerResourceDefinition[];
}

export interface PipelineResourceDefinition {
  pipeline: string;
  source: string; // path to another pipeline YAML
  project?: string;
  version?: string;
}

export interface RepositoryResourceDefinition {
  repository: string;
  type: 'git' | 'github';
  name: string;
  ref?: string;
  endpoint?: string;
}

export interface ContainerResourceDefinition {
  container: string;
  image: string;
  options?: string;
  env?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  mountReadOnly?: {
    work?: boolean;
    externals?: boolean;
    tools?: boolean;
    tasks?: boolean;
  };
}

// Service connection
export interface ServiceConnection {
  name: string;
  type: string;
  url?: string;
  credentials?: Record<string, string>;
}

// Service connections config file structure
export interface ServiceConnectionsConfig {
  connections: ServiceConnection[];
}

// Task definition (task.json manifest format)
export interface TaskDefinition {
  id: string;
  name: string;
  version: {
    major: number;
    minor: number;
    patch: number;
  };
  description?: string;
  author?: string;
  inputs?: TaskInput[];
  outputs?: TaskOutput[];
  execution: {
    node?: {
      target: string;
    };
  };
}

export interface TaskInput {
  name: string;
  type:
    | 'string'
    | 'boolean'
    | 'filePath'
    | 'multiLine'
    | 'secureFile'
    | 'pickList'
    | 'radio';
  label?: string;
  required?: boolean;
  defaultValue?: string;
  helpMarkDown?: string;
  options?: Record<string, string>;
}

export interface TaskOutput {
  name: string;
  description?: string;
}

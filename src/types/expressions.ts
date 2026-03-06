// Expression AST types for the pipeline expression parser

export type Expression =
  | LiteralExpression
  | VariableExpression
  | FunctionCallExpression
  | PropertyAccessExpression
  | IndexAccessExpression;

export interface LiteralExpression {
  type: 'literal';
  value: string | number | boolean | null;
  dataType: 'string' | 'number' | 'boolean' | 'null' | 'version';
}

export interface VariableExpression {
  type: 'variable';
  name: string;
  namespace?: string; // e.g., 'variables', 'parameters', 'dependencies'
}

export interface FunctionCallExpression {
  type: 'function';
  name: string;
  args: Expression[];
}

export interface PropertyAccessExpression {
  type: 'propertyAccess';
  object: Expression;
  property: string;
}

export interface IndexAccessExpression {
  type: 'indexAccess';
  object: Expression;
  index: Expression;
}

// Data available during expression evaluation
export interface ExpressionContext {
  variables: Record<string, string>;
  parameters: Record<string, unknown>;
  dependencies: Record<string, DependencyContext>;
  pipeline: Record<string, string>;
}

export interface DependencyContext {
  result: string;
  outputs: Record<string, string>;
}

// Expression evaluation result
export type ExpressionResult =
  | string
  | number
  | boolean
  | null
  | unknown[]
  | Record<string, unknown>;

// Template expression directives
export interface TemplateDirective {
  type: 'if' | 'elseif' | 'else' | 'each';
}

export interface IfDirective extends TemplateDirective {
  type: 'if';
  condition: string;
}

export interface ElseIfDirective extends TemplateDirective {
  type: 'elseif';
  condition: string;
}

export interface ElseDirective extends TemplateDirective {
  type: 'else';
}

export interface EachDirective extends TemplateDirective {
  type: 'each';
  variable: string;
  collection: string;
}

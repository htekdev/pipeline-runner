import { describe, it, expect } from 'vitest';
import {
  parseExpression,
  ExpressionTokenizer,
  ExpressionParseError,
} from '../../src/compiler/expression-parser.js';
import type {
  LiteralExpression,
  VariableExpression,
  FunctionCallExpression,
  PropertyAccessExpression,
  IndexAccessExpression,
} from '../../src/types/expressions.js';

// ─── Tokenizer tests ───────────────────────────────────────────────────────

describe('ExpressionTokenizer', () => {
  function tokenize(input: string) {
    return new ExpressionTokenizer(input).tokenize();
  }

  it('tokenizes an empty string', () => {
    const tokens = tokenize('');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('eof');
  });

  it('tokenizes single-quoted strings', () => {
    const tokens = tokenize("'hello world'");
    expect(tokens[0]).toMatchObject({ type: 'string', value: 'hello world' });
  });

  it('tokenizes strings with escaped quotes', () => {
    const tokens = tokenize("'it''s a test'");
    expect(tokens[0]).toMatchObject({ type: 'string', value: "it's a test" });
  });

  it('tokenizes empty strings', () => {
    const tokens = tokenize("''");
    expect(tokens[0]).toMatchObject({ type: 'string', value: '' });
  });

  it('tokenizes integers', () => {
    const tokens = tokenize('123');
    expect(tokens[0]).toMatchObject({ type: 'number', value: '123' });
  });

  it('tokenizes floats', () => {
    const tokens = tokenize('1.5');
    expect(tokens[0]).toMatchObject({ type: 'number', value: '1.5' });
  });

  it('tokenizes negative numbers', () => {
    const tokens = tokenize('-10');
    expect(tokens[0]).toMatchObject({ type: 'number', value: '-10' });
  });

  it('tokenizes negative floats', () => {
    const tokens = tokenize('-3.14');
    expect(tokens[0]).toMatchObject({ type: 'number', value: '-3.14' });
  });

  it('tokenizes version literals (3 segments)', () => {
    const tokens = tokenize('1.2.3');
    expect(tokens[0]).toMatchObject({ type: 'version', value: '1.2.3' });
  });

  it('tokenizes version literals (4 segments)', () => {
    const tokens = tokenize('1.2.3.4');
    expect(tokens[0]).toMatchObject({ type: 'version', value: '1.2.3.4' });
  });

  it('tokenizes boolean True (case-insensitive)', () => {
    for (const val of ['True', 'true', 'TRUE', 'tRuE']) {
      const tokens = tokenize(val);
      expect(tokens[0]).toMatchObject({ type: 'boolean', value: 'true' });
    }
  });

  it('tokenizes boolean False (case-insensitive)', () => {
    for (const val of ['False', 'false', 'FALSE']) {
      const tokens = tokenize(val);
      expect(tokens[0]).toMatchObject({ type: 'boolean', value: 'false' });
    }
  });

  it('tokenizes null', () => {
    const tokens = tokenize('null');
    expect(tokens[0]).toMatchObject({ type: 'null', value: 'null' });
  });

  it('tokenizes identifiers', () => {
    const tokens = tokenize('myVar');
    expect(tokens[0]).toMatchObject({ type: 'identifier', value: 'myVar' });
  });

  it('tokenizes identifiers with underscores', () => {
    const tokens = tokenize('my_var_2');
    expect(tokens[0]).toMatchObject({ type: 'identifier', value: 'my_var_2' });
  });

  it('tokenizes punctuation', () => {
    const tokens = tokenize('( ) [ ] , .');
    const types = tokens.slice(0, -1).map((t) => t.type);
    expect(types).toEqual(['lparen', 'rparen', 'lbracket', 'rbracket', 'comma', 'dot']);
  });

  it('tokenizes a function call expression', () => {
    const tokens = tokenize("eq(a, 'hello')");
    const types = tokens.slice(0, -1).map((t) => t.type);
    expect(types).toEqual(['identifier', 'lparen', 'identifier', 'comma', 'string', 'rparen']);
  });

  it('tokenizes property access with brackets', () => {
    const tokens = tokenize("outputs['stepName.varName']");
    const types = tokens.slice(0, -1).map((t) => t.type);
    expect(types).toEqual(['identifier', 'lbracket', 'string', 'rbracket']);
  });

  it('skips whitespace', () => {
    const tokens = tokenize('  eq ( a ,  b ) ');
    const types = tokens.slice(0, -1).map((t) => t.type);
    expect(types).toEqual(['identifier', 'lparen', 'identifier', 'comma', 'identifier', 'rparen']);
  });

  it('throws on unterminated string', () => {
    expect(() => tokenize("'unterminated")).toThrow(ExpressionParseError);
  });

  it('throws on unexpected character', () => {
    expect(() => tokenize('a + b')).toThrow(ExpressionParseError);
  });
});

// ─── Parser: Literal expressions ────────────────────────────────────────────

describe('parseExpression — literals', () => {
  it('parses string literal', () => {
    const ast = parseExpression("'hello world'") as LiteralExpression;
    expect(ast.type).toBe('literal');
    expect(ast.value).toBe('hello world');
    expect(ast.dataType).toBe('string');
  });

  it('parses string with escaped quotes', () => {
    const ast = parseExpression("'it''s fine'") as LiteralExpression;
    expect(ast.value).toBe("it's fine");
  });

  it('parses empty string', () => {
    const ast = parseExpression("''") as LiteralExpression;
    expect(ast.value).toBe('');
    expect(ast.dataType).toBe('string');
  });

  it('parses integer', () => {
    const ast = parseExpression('42') as LiteralExpression;
    expect(ast.type).toBe('literal');
    expect(ast.value).toBe(42);
    expect(ast.dataType).toBe('number');
  });

  it('parses float', () => {
    const ast = parseExpression('3.14') as LiteralExpression;
    expect(ast.value).toBe(3.14);
    expect(ast.dataType).toBe('number');
  });

  it('parses negative integer', () => {
    const ast = parseExpression('-10') as LiteralExpression;
    expect(ast.value).toBe(-10);
    expect(ast.dataType).toBe('number');
  });

  it('parses zero', () => {
    const ast = parseExpression('0') as LiteralExpression;
    expect(ast.value).toBe(0);
    expect(ast.dataType).toBe('number');
  });

  it('parses boolean true', () => {
    const ast = parseExpression('True') as LiteralExpression;
    expect(ast.value).toBe(true);
    expect(ast.dataType).toBe('boolean');
  });

  it('parses boolean false', () => {
    const ast = parseExpression('false') as LiteralExpression;
    expect(ast.value).toBe(false);
    expect(ast.dataType).toBe('boolean');
  });

  it('parses null', () => {
    const ast = parseExpression('null') as LiteralExpression;
    expect(ast.value).toBe(null);
    expect(ast.dataType).toBe('null');
  });

  it('parses version literal', () => {
    const ast = parseExpression('1.2.3') as LiteralExpression;
    expect(ast.type).toBe('literal');
    expect(ast.value).toBe('1.2.3');
    expect(ast.dataType).toBe('version');
  });

  it('parses 4-segment version', () => {
    const ast = parseExpression('10.0.18363.1') as LiteralExpression;
    expect(ast.value).toBe('10.0.18363.1');
    expect(ast.dataType).toBe('version');
  });

  it('parses empty expression as empty string', () => {
    const ast = parseExpression('') as LiteralExpression;
    expect(ast.type).toBe('literal');
    expect(ast.value).toBe('');
    expect(ast.dataType).toBe('string');
  });

  it('parses whitespace-only expression as empty string', () => {
    const ast = parseExpression('   ') as LiteralExpression;
    expect(ast.type).toBe('literal');
    expect(ast.value).toBe('');
    expect(ast.dataType).toBe('string');
  });
});

// ─── Parser: Variable expressions ───────────────────────────────────────────

describe('parseExpression — variables', () => {
  it('parses simple variable', () => {
    const ast = parseExpression('myVar') as VariableExpression;
    expect(ast.type).toBe('variable');
    expect(ast.name).toBe('myVar');
    expect(ast.namespace).toBeUndefined();
  });

  it('parses namespaced variable (variables.x)', () => {
    const ast = parseExpression('variables.myVar') as VariableExpression;
    expect(ast.type).toBe('variable');
    expect(ast.namespace).toBe('variables');
    expect(ast.name).toBe('myVar');
  });

  it('parses namespaced variable (parameters.x)', () => {
    const ast = parseExpression('parameters.myParam') as VariableExpression;
    expect(ast.type).toBe('variable');
    expect(ast.namespace).toBe('parameters');
    expect(ast.name).toBe('myParam');
  });

  it('parses namespaced variable (pipeline.x)', () => {
    const ast = parseExpression('pipeline.workspace') as VariableExpression;
    expect(ast.type).toBe('variable');
    expect(ast.namespace).toBe('pipeline');
    expect(ast.name).toBe('workspace');
  });

  it('parses namespaced variable (dependencies.x)', () => {
    const ast = parseExpression('dependencies.buildJob') as VariableExpression;
    expect(ast.type).toBe('variable');
    expect(ast.namespace).toBe('dependencies');
    expect(ast.name).toBe('buildJob');
  });

  it('parses unknown namespace as plain variable + property access', () => {
    const ast = parseExpression('unknown.prop') as PropertyAccessExpression;
    expect(ast.type).toBe('propertyAccess');
    expect((ast.object as VariableExpression).name).toBe('unknown');
    expect(ast.property).toBe('prop');
  });
});

// ─── Parser: Property and index access ──────────────────────────────────────

describe('parseExpression — property and index access', () => {
  it('parses bracket notation on a variable', () => {
    const ast = parseExpression("variables['myVar']");
    // variables is a known namespace, so first we get VariableExpression
    // but then ['myVar'] — wait, variables is namespace, the dot is required first
    // Actually: variables is an identifier. No dot follows, instead [ follows.
    // So it's a plain variable 'variables' with index access.
    expect(ast.type).toBe('indexAccess');
    const idx = ast as IndexAccessExpression;
    expect((idx.object as VariableExpression).name).toBe('variables');
    expect((idx.index as LiteralExpression).value).toBe('myVar');
  });

  it('parses chained property access', () => {
    const ast = parseExpression('dependencies.buildJob.outputs');
    // dependencies.buildJob → VariableExpression { ns: 'dependencies', name: 'buildJob' }
    // .outputs → PropertyAccessExpression
    expect(ast.type).toBe('propertyAccess');
    const prop = ast as PropertyAccessExpression;
    expect(prop.property).toBe('outputs');
    const inner = prop.object as VariableExpression;
    expect(inner.namespace).toBe('dependencies');
    expect(inner.name).toBe('buildJob');
  });

  it('parses chained property + index access', () => {
    const ast = parseExpression("dependencies.buildJob.outputs['step1.version']");
    expect(ast.type).toBe('indexAccess');
    const idx = ast as IndexAccessExpression;
    expect((idx.index as LiteralExpression).value).toBe('step1.version');

    const prop = idx.object as PropertyAccessExpression;
    expect(prop.property).toBe('outputs');

    const variable = prop.object as VariableExpression;
    expect(variable.namespace).toBe('dependencies');
    expect(variable.name).toBe('buildJob');
  });

  it('parses multiple bracket accesses', () => {
    const ast = parseExpression("a['b']['c']");
    expect(ast.type).toBe('indexAccess');
    const outer = ast as IndexAccessExpression;
    expect((outer.index as LiteralExpression).value).toBe('c');

    const inner = outer.object as IndexAccessExpression;
    expect((inner.index as LiteralExpression).value).toBe('b');
    expect((inner.object as VariableExpression).name).toBe('a');
  });

  it('parses mixed dot and bracket access', () => {
    const ast = parseExpression("a.b['c'].d");
    expect(ast.type).toBe('propertyAccess');
    const d = ast as PropertyAccessExpression;
    expect(d.property).toBe('d');

    expect(d.object.type).toBe('indexAccess');
    const c = d.object as IndexAccessExpression;
    expect((c.index as LiteralExpression).value).toBe('c');

    expect(c.object.type).toBe('propertyAccess');
    const b = c.object as PropertyAccessExpression;
    expect(b.property).toBe('b');
    expect((b.object as VariableExpression).name).toBe('a');
  });

  it('parses numeric index access', () => {
    const ast = parseExpression('arr[0]');
    expect(ast.type).toBe('indexAccess');
    const idx = ast as IndexAccessExpression;
    expect((idx.object as VariableExpression).name).toBe('arr');
    expect((idx.index as LiteralExpression).value).toBe(0);
  });
});

// ─── Parser: Function calls ─────────────────────────────────────────────────

describe('parseExpression — function calls', () => {
  it('parses function with no arguments', () => {
    const ast = parseExpression('always()') as FunctionCallExpression;
    expect(ast.type).toBe('function');
    expect(ast.name).toBe('always');
    expect(ast.args).toHaveLength(0);
  });

  it('parses function with one argument', () => {
    const ast = parseExpression('succeeded()') as FunctionCallExpression;
    expect(ast.type).toBe('function');
    expect(ast.name).toBe('succeeded');
    expect(ast.args).toHaveLength(0);
  });

  it('parses function with literal argument', () => {
    const ast = parseExpression("contains(variables.env, 'prod')") as FunctionCallExpression;
    expect(ast.type).toBe('function');
    expect(ast.name).toBe('contains');
    expect(ast.args).toHaveLength(2);
    expect(ast.args[0].type).toBe('variable');
    expect((ast.args[1] as LiteralExpression).value).toBe('prod');
  });

  it('parses function with multiple arguments', () => {
    const ast = parseExpression("eq(a, 'x')") as FunctionCallExpression;
    expect(ast.args).toHaveLength(2);
    expect((ast.args[0] as VariableExpression).name).toBe('a');
    expect((ast.args[1] as LiteralExpression).value).toBe('x');
  });

  it('parses nested function calls', () => {
    const ast = parseExpression("and(eq(a, 'x'), ne(b, 'y'))") as FunctionCallExpression;
    expect(ast.name).toBe('and');
    expect(ast.args).toHaveLength(2);

    const eq = ast.args[0] as FunctionCallExpression;
    expect(eq.name).toBe('eq');
    expect(eq.args).toHaveLength(2);

    const ne = ast.args[1] as FunctionCallExpression;
    expect(ne.name).toBe('ne');
    expect(ne.args).toHaveLength(2);
  });

  it('parses deeply nested function calls', () => {
    const ast = parseExpression("eq(lower(variables.env), 'prod')") as FunctionCallExpression;
    expect(ast.name).toBe('eq');
    expect(ast.args).toHaveLength(2);

    const lower = ast.args[0] as FunctionCallExpression;
    expect(lower.name).toBe('lower');
    expect(lower.args).toHaveLength(1);

    const varExpr = lower.args[0] as VariableExpression;
    expect(varExpr.namespace).toBe('variables');
    expect(varExpr.name).toBe('env');
  });

  it('parses format function with multiple args', () => {
    const ast = parseExpression("format('Hello {0}, you are {1}', name, age)") as FunctionCallExpression;
    expect(ast.name).toBe('format');
    expect(ast.args).toHaveLength(3);
    expect((ast.args[0] as LiteralExpression).value).toBe('Hello {0}, you are {1}');
  });

  it('parses function call on property access result', () => {
    // This isn't typical ADO syntax but should parse: fn result with postfix
    const ast = parseExpression("coalesce(variables.a, 'default')") as FunctionCallExpression;
    expect(ast.name).toBe('coalesce');
    expect(ast.args).toHaveLength(2);
  });
});

// ─── Parser: Complex expressions ────────────────────────────────────────────

describe('parseExpression — complex expressions', () => {
  it('parses stageDependencies access', () => {
    const ast = parseExpression(
      "stageDependencies.deploy.buildJob.outputs['version']",
    );
    // stageDependencies.deploy → VariableExpression { ns: stageDependencies, name: deploy }
    // .buildJob → PropertyAccess
    // .outputs → PropertyAccess
    // ['version'] → IndexAccess
    expect(ast.type).toBe('indexAccess');
  });

  it('parses expression with lots of whitespace', () => {
    const ast = parseExpression("  eq(  variables.foo  ,  'bar'  )  ") as FunctionCallExpression;
    expect(ast.name).toBe('eq');
    expect(ast.args).toHaveLength(2);
  });

  it('parses boolean in function call', () => {
    const ast = parseExpression('eq(variables.debug, true)') as FunctionCallExpression;
    expect(ast.name).toBe('eq');
    expect((ast.args[1] as LiteralExpression).value).toBe(true);
  });

  it('parses null in function call', () => {
    const ast = parseExpression('ne(variables.result, null)') as FunctionCallExpression;
    expect(ast.name).toBe('ne');
    expect((ast.args[1] as LiteralExpression).value).toBe(null);
  });

  it('parses parenthesized expression', () => {
    const ast = parseExpression("(eq(a, 'b'))") as FunctionCallExpression;
    expect(ast.name).toBe('eq');
  });

  it('throws on unexpected token after expression', () => {
    expect(() => parseExpression('a b')).toThrow(ExpressionParseError);
  });

  it('throws on missing closing paren', () => {
    expect(() => parseExpression('eq(a, b')).toThrow(ExpressionParseError);
  });

  it('throws on missing closing bracket', () => {
    expect(() => parseExpression("a['b'")).toThrow(ExpressionParseError);
  });

  it('throws on missing property name after dot', () => {
    // 'a.' followed by eof — the variable 'a' is not a known namespace,
    // so '.' is treated as postfix dot which expects an identifier after it
    expect(() => parseExpression('a.')).toThrow(ExpressionParseError);
  });
});

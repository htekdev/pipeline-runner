import type { ParameterDefinition } from '../types/pipeline.js';

export interface ParameterValidationError {
  parameter: string;
  message: string;
}

export interface ResolvedParameters {
  values: Record<string, unknown>;
  errors: ParameterValidationError[];
  warnings: string[];
}

export class ParameterResolver {
  /**
   * Resolve parameters by merging CLI args, template args, and defaults.
   * Priority: CLI args > template args > definition defaults.
   * Validates types and allowed values for every resolved parameter.
   */
  resolve(
    definitions: ParameterDefinition[],
    cliArgs: Record<string, string>,
    templateArgs?: Record<string, unknown>,
  ): ResolvedParameters {
    const values: Record<string, unknown> = {};
    const errors: ParameterValidationError[] = [];
    const warnings: string[] = [];

    const definedNames = new Set(definitions.map((d) => d.name));

    // Warn about CLI args that don't match any parameter definition
    for (const cliName of Object.keys(cliArgs)) {
      if (!definedNames.has(cliName)) {
        warnings.push(
          `CLI parameter '--param.${cliName}' does not match any defined parameter and will be ignored`,
        );
      }
    }

    for (const definition of definitions) {
      const { name } = definition;

      // Determine raw value by priority
      let rawValue: unknown | undefined;
      let source: 'cli' | 'template' | 'default' | 'none' = 'none';

      if (name in cliArgs) {
        rawValue = cliArgs[name];
        source = 'cli';
      } else if (templateArgs && name in templateArgs) {
        rawValue = templateArgs[name];
        source = 'template';
      } else if (definition.default !== undefined) {
        rawValue = definition.default;
        source = 'default';
      }

      if (source === 'none') {
        errors.push({
          parameter: name,
          message: `Required parameter '${name}' was not provided and has no default value`,
        });
        continue;
      }

      // Coerce CLI string values to the declared type
      let coercedValue: unknown;
      if (source === 'cli') {
        try {
          coercedValue = this.coerceValue(rawValue as string, definition.type);
        } catch (err) {
          errors.push({
            parameter: name,
            message:
              err instanceof Error
                ? err.message
                : `Failed to coerce parameter '${name}'`,
          });
          continue;
        }
      } else {
        // Template args and defaults are already typed — just validate
        coercedValue = rawValue;
      }

      const validation = this.validateParameter(definition, coercedValue);
      if (!validation.valid) {
        errors.push({
          parameter: name,
          message: validation.error!,
        });
        continue;
      }

      values[name] = validation.coerced;
    }

    return { values, errors, warnings };
  }

  /**
   * Validate a single parameter value against its definition.
   * Checks type correctness and allowed values.
   */
  validateParameter(
    definition: ParameterDefinition,
    value: unknown,
  ): { valid: boolean; coerced: unknown; error?: string } {
    const { name, type } = definition;

    // Type validation
    const typeResult = this.validateType(name, value, type);
    if (!typeResult.valid) {
      return typeResult;
    }

    // Allowed values validation
    if (definition.values && definition.values.length > 0) {
      const allowed = this.isValueAllowed(value, definition.values, type);
      if (!allowed) {
        const allowedDisplay = definition.values
          .map((v) => JSON.stringify(v))
          .join(', ');
        return {
          valid: false,
          coerced: value,
          error: `Parameter '${name}' value ${JSON.stringify(value)} is not in the allowed values: [${allowedDisplay}]`,
        };
      }
    }

    return { valid: true, coerced: value };
  }

  /**
   * Coerce a CLI string value to the parameter's declared type.
   * Throws on invalid input.
   */
  coerceValue(value: string, type: ParameterDefinition['type']): unknown {
    switch (type) {
      case 'string':
        return value;

      case 'number': {
        const num = parseFloat(value);
        if (Number.isNaN(num)) {
          throw new Error(
            `Cannot convert '${value}' to number: value is not a valid number`,
          );
        }
        return num;
      }

      case 'boolean': {
        const lower = value.toLowerCase();
        if (['true', '1', 'yes'].includes(lower)) return true;
        if (['false', '0', 'no'].includes(lower)) return false;
        throw new Error(
          `Cannot convert '${value}' to boolean: expected 'true', 'false', '1', '0', 'yes', or 'no'`,
        );
      }

      case 'object':
      case 'step':
      case 'stepList':
      case 'job':
      case 'jobList':
      case 'stage':
      case 'stageList': {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          throw new Error(
            `Cannot parse '${value}' as ${type}: invalid JSON`,
          );
        }
      }

      default: {
        const _exhaustive: never = type;
        throw new Error(`Unknown parameter type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Build an expression context record from resolved parameters.
   * Parameters are accessible as `parameters.name` in expressions.
   */
  buildParameterContext(resolved: ResolvedParameters): Record<string, unknown> {
    return { ...resolved.values };
  }

  private validateType(
    name: string,
    value: unknown,
    type: ParameterDefinition['type'],
  ): { valid: boolean; coerced: unknown; error?: string } {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            valid: false,
            coerced: value,
            error: `Parameter '${name}' expected type 'string' but got '${typeof value}'`,
          };
        }
        return { valid: true, coerced: value };

      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return {
            valid: false,
            coerced: value,
            error: `Parameter '${name}' expected type 'number' but got '${typeof value}'`,
          };
        }
        return { valid: true, coerced: value };

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            valid: false,
            coerced: value,
            error: `Parameter '${name}' expected type 'boolean' but got '${typeof value}'`,
          };
        }
        return { valid: true, coerced: value };

      case 'object':
        if (value === null || typeof value !== 'object') {
          return {
            valid: false,
            coerced: value,
            error: `Parameter '${name}' expected type 'object' but got '${value === null ? 'null' : typeof value}'`,
          };
        }
        return { valid: true, coerced: value };

      case 'step':
      case 'job':
      case 'stage':
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return {
            valid: false,
            coerced: value,
            error: `Parameter '${name}' expected type '${type}' (object) but got '${Array.isArray(value) ? 'array' : typeof value}'`,
          };
        }
        return { valid: true, coerced: value };

      case 'stepList':
      case 'jobList':
      case 'stageList':
        if (!Array.isArray(value)) {
          return {
            valid: false,
            coerced: value,
            error: `Parameter '${name}' expected type '${type}' (array) but got '${typeof value}'`,
          };
        }
        return { valid: true, coerced: value };

      default: {
        const _exhaustive: never = type;
        return {
          valid: false,
          coerced: value,
          error: `Unknown parameter type '${_exhaustive}' for parameter '${name}'`,
        };
      }
    }
  }

  private isValueAllowed(
    value: unknown,
    allowedValues: unknown[],
    type: ParameterDefinition['type'],
  ): boolean {
    return allowedValues.some((allowed) => {
      if (type === 'string' && typeof value === 'string' && typeof allowed === 'string') {
        return value.toLowerCase() === allowed.toLowerCase();
      }
      if (type === 'number' && typeof value === 'number' && typeof allowed === 'number') {
        return value === allowed;
      }
      // For boolean, use strict equality
      if (type === 'boolean') {
        return value === allowed;
      }
      // Fallback: strict equality
      return value === allowed;
    });
  }
}

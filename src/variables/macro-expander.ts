// Macro expansion for $(variableName) syntax

const MACRO_PATTERN = /\$\(([a-zA-Z_][a-zA-Z0-9_.]*)\)/g;

/**
 * Expand $(variableName) macros in a string.
 * Unknown variables are left as-is: $(unknown) stays as $(unknown).
 * Nested macros are NOT supported.
 */
export function expandMacros(
  input: string,
  variables: Record<string, string>,
): string {
  return input.replace(MACRO_PATTERN, (match, varName: string) => {
    if (varName in variables) {
      return variables[varName];
    }
    return match;
  });
}

/**
 * Find all macro references in a string, returning the variable names referenced.
 */
export function findMacroReferences(input: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(MACRO_PATTERN.source, 'g');
  while ((match = pattern.exec(input)) !== null) {
    names.push(match[1]);
  }
  return names;
}

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

export async function loadPipeline(filePath: string): Promise<unknown> {
  const resolvedPath = path.resolve(process.cwd(), filePath);

  try {
    await fs.access(resolvedPath);
  } catch {
    throw new Error(`Pipeline file not found: ${resolvedPath}`);
  }

  const content = await fs.readFile(resolvedPath, 'utf-8');

  if (!content.trim()) {
    throw new Error(`Pipeline file is empty: ${resolvedPath}`);
  }

  try {
    const parsed = yaml.load(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Pipeline file must contain a YAML object (not a scalar or array)');
    }
    return parsed;
  } catch (err) {
    if (err instanceof yaml.YAMLException) {
      throw new Error(`YAML parse error in ${filePath}: ${err.message}`);
    }
    throw err;
  }
}

export async function loadYamlFile(filePath: string): Promise<unknown> {
  const content = await fs.readFile(filePath, 'utf-8');
  return yaml.load(content);
}

export function resolveTemplatePath(templateRef: string, basePath: string): string {
  return path.resolve(path.dirname(basePath), templateRef);
}

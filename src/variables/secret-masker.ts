import { Transform, type TransformCallback } from 'node:stream';

/**
 * Masks registered secret values in log output.
 * Replaces exact occurrences of secret values with '***'.
 * Secrets are replaced longest-first to prevent partial masking.
 */
export class SecretMasker {
  private readonly secrets: Set<string> = new Set();
  private sortedSecrets: string[] = [];
  private regexCache: RegExp | null = null;

  /** Register a secret value to be masked. */
  addSecret(value: string): void {
    if (value === '') {
      return;
    }
    if (value.length < 3) {
      console.warn(
        `[SecretMasker] Warning: registering a very short secret (length=${value.length}). ` +
          'This may cause unexpected masking in output.',
      );
    }
    if (!this.secrets.has(value)) {
      this.secrets.add(value);
      this.rebuildSortedSecrets();
    }
  }

  /** Remove a secret (if variable is unset). */
  removeSecret(value: string): void {
    if (this.secrets.delete(value)) {
      this.rebuildSortedSecrets();
    }
  }

  /** Mask all registered secrets in a string. */
  mask(input: string): string {
    if (this.secrets.size === 0 || input === '') {
      return input;
    }
    const regex = this.getOrBuildRegex();
    if (!regex) {
      return input;
    }
    return input.replace(regex, '***');
  }

  /** Get the number of registered secrets. */
  get secretCount(): number {
    return this.secrets.size;
  }

  /** Create a writable transform stream that masks secrets in piped data. */
  createMaskingStream(): Transform {
    const masker = this;
    return new Transform({
      // Operate in text mode
      decodeStrings: true,
      encoding: 'utf-8',
      transform(
        chunk: Buffer | string,
        _encoding: BufferEncoding,
        callback: TransformCallback,
      ): void {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        const masked = masker.mask(text);
        callback(null, masked);
      },
    });
  }

  private rebuildSortedSecrets(): void {
    // Sort longest first so longer secrets are replaced before shorter substrings
    this.sortedSecrets = [...this.secrets].sort((a, b) => b.length - a.length);
    this.regexCache = null;
  }

  private getOrBuildRegex(): RegExp | null {
    if (this.regexCache) {
      return this.regexCache;
    }
    if (this.sortedSecrets.length === 0) {
      return null;
    }
    // Escape each secret for use in a regex, then join with alternation
    const escaped = this.sortedSecrets.map(escapeRegExp);
    this.regexCache = new RegExp(escaped.join('|'), 'g');
    return this.regexCache;
  }
}

/** Escape special regex characters in a string. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

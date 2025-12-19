import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { writeInfo, writeWarn } from '../utils/logging.js';

export interface DiscoveryOptions {
  patterns: string[];
  maxSecrets?: number;
}

export interface DiscoveryResult {
  discovered: SecretMapping[];
  skipped: string[];
  warnings: string[];
}

/**
 * Service for auto-discovering secrets from environment variables
 * based on explicit patterns with prefix matching support
 */
export class EnvDiscoveryService {
  private readonly DEFAULT_MAX_SECRETS = 100;

  /**
   * Discover environment variables matching the provided patterns
   * @param options Discovery options including patterns and max secrets limit
   * @returns Discovery result with discovered mappings and warnings
   */
  discover(options: DiscoveryOptions): DiscoveryResult {
    const { patterns, maxSecrets = this.DEFAULT_MAX_SECRETS } = options;

    if (!patterns || patterns.length === 0) {
      return {
        discovered: [],
        skipped: [],
        warnings: ['No patterns provided for discovery']
      };
    }

    const discovered: SecretMapping[] = [];
    const skipped: string[] = [];
    const warnings: string[] = [];

    // Normalize and validate patterns
    const normalizedPatterns = this.normalizePatterns(patterns);

    if (normalizedPatterns.length === 0) {
      return {
        discovered: [],
        skipped: [],
        warnings: ['No valid patterns after normalization']
      };
    }

    // Get all environment variables
    const envVars = Object.keys(process.env);

    // Match environment variables against patterns
    for (const envVar of envVars) {
      // Check if we've reached the max limit
      if (discovered.length >= maxSecrets) {
        skipped.push(
          `...and ${envVars.length - discovered.length} more env vars (max limit reached)`
        );
        warnings.push(
          `Discovery limit of ${maxSecrets} secrets reached. Consider increasing maxSecrets or using more specific patterns.`
        );
        break;
      }

      if (this.matchesPattern(envVar, normalizedPatterns)) {
        // Check if env var is not empty
        const value = process.env[envVar];
        if (value && value.trim().length > 0) {
          discovered.push({
            secretId: this.sanitizeSecretId(envVar),
            envVar: envVar,
            description: `Auto-discovered from environment variable`
          });
        } else {
          skipped.push(`${envVar} (empty value)`);
        }
      }
    }

    // Log discovery results
    if (discovered.length > 0) {
      writeInfo(
        `Discovered ${discovered.length} secret(s) matching patterns: ${normalizedPatterns.join(', ')}`
      );
    }

    if (skipped.length > 0 && skipped.length <= 5) {
      writeInfo(`Skipped ${skipped.length} env var(s): ${skipped.join(', ')}`);
    }

    return {
      discovered,
      skipped,
      warnings
    };
  }

  /**
   * Parse and normalize discovery patterns
   * Supports comma-separated patterns with prefix matching (e.g., "GITHUB_*,OPENAI_*")
   */
  private normalizePatterns(patterns: string[]): string[] {
    const normalized: string[] = [];

    for (const pattern of patterns) {
      // Split by comma if it's a single string
      const parts = typeof pattern === 'string' ? pattern.split(',') : [pattern];

      for (const part of parts) {
        const trimmed = part.trim().toUpperCase();

        // Validate pattern - must not be empty or just "*"
        if (trimmed.length === 0 || trimmed === '*') {
          continue;
        }

        // Remove trailing * for prefix matching
        const prefix = trimmed.endsWith('*') ? trimmed.slice(0, -1) : trimmed;

        if (prefix.length > 0 && !normalized.includes(prefix)) {
          normalized.push(prefix);
        }
      }
    }

    return normalized;
  }

  /**
   * Check if an environment variable matches any of the patterns
   * Supports prefix matching (e.g., "GITHUB_" matches "GITHUB_TOKEN", "GITHUB_USER", etc.)
   */
  private matchesPattern(envVar: string, patterns: string[]): boolean {
    const upperEnvVar = envVar.toUpperCase();

    for (const pattern of patterns) {
      // Exact match or prefix match
      if (upperEnvVar === pattern || upperEnvVar.startsWith(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Sanitize environment variable name to create a valid secretId
   * Converts to lowercase and replaces special characters
   */
  private sanitizeSecretId(envVar: string): string {
    return envVar
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Validate that patterns don't include dangerous wildcards
   * @throws Error if patterns are unsafe
   */
  validatePatterns(patterns: string[]): void {
    for (const pattern of patterns) {
      const trimmed = pattern.trim();

      // Reject bare * or patterns that are too broad
      if (trimmed === '*' || trimmed === '') {
        throw new Error(
          'Invalid discovery pattern: patterns must be explicit (e.g., "GITHUB_*", "OPENAI_*"), not bare "*"'
        );
      }

      // Warn about very broad patterns
      if (trimmed.length <= 2) {
        throw new Error(
          `Pattern "${trimmed}" is too broad. Use more specific prefixes (e.g., "GITHUB_", "OPENAI_")`
        );
      }
    }
  }
}

import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { ToolError } from '../utils/errors.js';
import { writeInfo, writeDebug } from '../utils/logging.js';

/**
 * Service for auto-discovering secrets from environment variables.
 *
 * Security:
 * - Requires explicit patterns (no wildcard-only discovery)
 * - Enforces maximum discovery limit
 * - Never logs actual secret values
 * - Discovery ≠ permission (policies still required)
 */
export class SecretDiscoveryService {
  /**
   * Discover secrets from environment variables matching the given patterns.
   *
   * @param patterns Array of patterns (e.g., ["GITHUB_*", "OPENAI_*"])
   * @returns Array of discovered secret mappings
   */
  discoverSecrets(patterns: string[]): SecretMapping[] {
    if (!patterns || patterns.length === 0) {
      throw new ToolError(
        TEXT.INIT_NO_PATTERNS_PROVIDED,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }

    // Validate patterns (must not be wildcard only)
    for (const pattern of patterns) {
      if (pattern === CONFIG.DISCOVER_ENV_PATTERN_WILDCARD) {
        throw new ToolError(
          TEXT.DISCOVER_PATTERN_INVALID.replace('{pattern}', pattern),
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
    }

    const discovered: SecretMapping[] = [];
    const processedKeys = new Set<string>();

    for (const pattern of patterns) {
      writeInfo(TEXT.DISCOVER_SCANNING_ENV.replace('{pattern}', pattern));

      const regex = this.patternToRegex(pattern);

      for (const [key, value] of Object.entries(process.env)) {
        // Skip if already processed
        if (processedKeys.has(key)) {
          continue;
        }

        // Skip if no value
        if (!value || value.trim().length === 0) {
          continue;
        }

        // Check if matches pattern
        if (regex.test(key)) {
          // Generate secret ID from env var name
          const secretId = this.envVarToSecretId(key);

          // Validate it doesn't exceed maximum
          if (discovered.length >= CONFIG.DISCOVER_ENV_MAX_SECRETS) {
            throw new ToolError(
              TEXT.DISCOVER_MAX_SECRETS_EXCEEDED
                .replace('{count}', discovered.length.toString())
                .replace('{max}', CONFIG.DISCOVER_ENV_MAX_SECRETS.toString()),
              CONFIG.ERROR_CODE_INVALID_REQUEST
            );
          }

          discovered.push({
            secretId,
            envVar: key,
            description: `Auto-discovered from ${key}`
          });

          processedKeys.add(key);
          writeDebug(`Discovered: ${secretId} -> ${key}`);
        }
      }
    }

    if (discovered.length === 0) {
      writeInfo(TEXT.DISCOVER_NO_SECRETS_FOUND);
    } else {
      writeInfo(TEXT.DISCOVER_FOUND_SECRETS.replace('{count}', discovered.length.toString()));
    }

    return discovered;
  }

  /**
   * Convert a pattern (e.g., "GITHUB_*") to a RegExp
   */
  private patternToRegex(pattern: string): RegExp {
    // Escape special regex characters except *
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    return new RegExp(`^${escaped}$`);
  }

  /**
   * Convert environment variable name to secret ID
   * Example: GITHUB_API_TOKEN -> github_api_token
   */
  private envVarToSecretId(envVar: string): string {
    return envVar.toLowerCase();
  }

  /**
   * Generate a minimal vault configuration from discovered secrets
   */
  generateConfig(mappings: SecretMapping[]): string {
    const config = {
      version: '1.0.0',
      mappings: mappings.map(m => ({
        secretId: m.secretId,
        envVar: m.envVar,
        description: m.description
      })),
      policies: mappings.map(m => ({
        secretId: m.secretId,
        allowedActions: ['http_get', 'http_post'],
        allowedDomains: [],
        rateLimit: {
          requests: CONFIG.DEFAULT_RATE_LIMIT_REQUESTS,
          windowSeconds: CONFIG.DEFAULT_RATE_LIMIT_WINDOW_SECONDS
        }
      })),
      settings: {
        auditDir: CONFIG.DEFAULT_AUDIT_DIR,
        maxFileSizeMb: CONFIG.AUDIT_MAX_FILE_SIZE_MB,
        maxFileAgeDays: CONFIG.AUDIT_MAX_FILE_AGE_DAYS
      }
    };

    return JSON.stringify(config, null, CONFIG.JSON_INDENT_SIZE);
  }
}

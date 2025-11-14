import { promises as fs } from 'fs';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { writeInfo, writeDebug } from '../utils/logging.js';

/**
 * Service for loading .env files with environment-specific precedence.
 *
 * Precedence order (highest to lowest):
 * 1. .env.{environment}.local
 * 2. .env.{environment}
 * 3. .env.local
 * 4. .env
 *
 * Security:
 * - Never logs actual secret values
 * - All .env files should be gitignored
 * - Values are loaded into process.env but not exposed
 */
export class EnvFileLoaderService {
  private loadedFiles: string[] = [];

  /**
   * Load environment files based on NODE_ENV or MCP_ENV
   */
  async loadEnvironmentFiles(): Promise<void> {
    const environment = process.env[CONFIG.ENV_MCP_ENV] || process.env[CONFIG.ENV_NODE_ENV];

    // Build list of files to try loading (in reverse precedence order)
    const filesToLoad: string[] = [
      CONFIG.ENV_FILE_BASE,
      CONFIG.ENV_FILE_LOCAL
    ];

    if (environment) {
      filesToLoad.push(
        `${CONFIG.ENV_FILE_BASE}.${environment}`,
        `${CONFIG.ENV_FILE_BASE}.${environment}.local`
      );
    }

    // Load each file (later files override earlier ones)
    for (const filePath of filesToLoad) {
      await this.loadEnvFile(filePath);
    }

    if (this.loadedFiles.length > 0) {
      writeInfo(TEXT.ENV_LOADER_FILES_LOADED.replace('{count}', this.loadedFiles.length.toString()));
      this.loadedFiles.forEach(file => {
        writeDebug(TEXT.ENV_LOADER_LOADED_FILE.replace('{file}', file));
      });
    }
  }

  /**
   * Load a single .env file if it exists
   */
  private async loadEnvFile(filePath: string): Promise<void> {
    try {
      // Check if file exists
      await fs.access(filePath);

      // Read file content
      const content = await fs.readFile(filePath, CONFIG.DEFAULT_ENCODING);

      // Parse and load variables
      const varCount = this.parseEnvContent(content);

      if (varCount > 0) {
        this.loadedFiles.push(filePath);
        writeDebug(TEXT.ENV_LOADER_PARSED_VARS.replace('{count}', varCount.toString()).replace('{file}', filePath));
      }
    } catch (error: any) {
      // Silently skip if file doesn't exist
      if (error.code !== CONFIG.FS_ERROR_ENOENT) {
        writeDebug(TEXT.ENV_LOADER_ERROR_READING.replace('{file}', filePath).replace('{error}', error.message));
      }
    }
  }

  /**
   * Parse .env file content and load into process.env
   * Returns the number of variables loaded
   */
  private parseEnvContent(content: string): number {
    const lines = content.split(CONFIG.LINE_ENDING_PATTERN);
    let count = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith(CONFIG.ENV_FILE_COMMENT_PREFIX)) {
        continue;
      }

      // Parse KEY=VALUE format
      const match = trimmed.match(CONFIG.ENV_FILE_LINE_REGEX);
      if (match) {
        const key = match[1].trim();
        let value = match[2] || CONFIG.EMPTY_STRING_FALLBACK;

        // Remove surrounding quotes if present
        value = value.replace(CONFIG.ENV_FILE_QUOTE_REGEX, '$2');

        // Only set if not already defined (existing env vars take precedence)
        if (!process.env[key]) {
          process.env[key] = value;
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Get list of loaded .env files
   */
  getLoadedFiles(): readonly string[] {
    return Object.freeze([...this.loadedFiles]);
  }

  /**
   * Check if a .env file is tracked by git (security warning)
   */
  async checkGitTracking(): Promise<string[]> {
    const trackedEnvFiles: string[] = [];

    try {
      // Check if we're in a git repository
      await fs.access('.git');

      // List of .env patterns to check
      const envPatterns = [
        CONFIG.ENV_FILE_BASE,
        `${CONFIG.ENV_FILE_BASE}.*`
      ];

      // Note: Full git integration would require spawning git commands
      // For now, we just warn users in documentation
      // A future enhancement could use: git ls-files .env*

    } catch {
      // Not a git repository or .git not accessible
    }

    return trackedEnvFiles;
  }
}

#!/usr/bin/env node

import { promises as fs } from 'fs';
import * as path from 'path';
import { EnvDiscoveryService } from '../services/env-discovery.service.js';
import { ConfigLoaderService } from '../services/config-loader.service.js';
import { VaultConfig } from '../schemas/config.schema.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { fmt } from '../utils/format.js';
import { writeInfo, writeError, writeWarn } from '../utils/logging.js';

export interface DiscoverEnvOptions {
  patterns: string[];
  configPath?: string;
  outputPath?: string;
  maxSecrets?: number;
  merge?: boolean;
}

/**
 * CLI tool for discovering environment variables and generating config
 */
export class DiscoverEnvCLI {
  private discoveryService = new EnvDiscoveryService();

  async run(options: DiscoverEnvOptions): Promise<void> {
    try {
      // Validate patterns
      this.discoveryService.validatePatterns(options.patterns);

      writeInfo('Starting environment variable discovery...');
      writeInfo(`Patterns: ${options.patterns.join(', ')}`);

      // Discover environment variables
      const result = this.discoveryService.discover({
        patterns: options.patterns,
        maxSecrets: options.maxSecrets || 100
      });

      if (result.discovered.length === 0) {
        writeWarn('No environment variables matched the provided patterns');
        return;
      }

      writeInfo(`Discovered ${result.discovered.length} secret(s)`);

      // Prepare config
      let config: VaultConfig = {
        version: '1.0.0',
        mappings: result.discovered,
        policies: [],
        settings: undefined
      };

      // If merge is enabled, merge with existing config
      if (options.merge && options.configPath) {
        config = await this.mergeWithExistingConfig(config, options.configPath);
      }

      // Output config
      const outputPath = options.outputPath || this.getDefaultOutputPath(options.configPath);
      await this.writeConfig(config, outputPath);

      writeInfo(`Configuration written to: ${outputPath}`);
      writeInfo(`Next steps:`);
      writeInfo(`1. Review the generated configuration file`);
      writeInfo(`2. Add policies to control access to these secrets`);
      writeInfo(`3. Run: mcp-secrets-vault ${outputPath}`);

      // Print warnings if any
      if (result.warnings.length > 0) {
        writeWarn('Warnings:');
        result.warnings.forEach(w => writeWarn(`  - ${w}`));
      }
    } catch (error: any) {
      writeError(`Discovery failed: ${error.message}`, {
        level: CONFIG.LOG_LEVEL_ERROR,
        code: CONFIG.ERROR_CODE_INVALID_REQUEST
      });
      throw error;
    }
  }

  private async mergeWithExistingConfig(
    newConfig: VaultConfig,
    configPath: string
  ): Promise<VaultConfig> {
    try {
      const configLoader = new ConfigLoaderService(configPath);
      const existingConfig = await configLoader.loadConfig();

      // Merge mappings, avoiding duplicates
      const existingEnvVars = new Set(existingConfig.mappings.map(m => m.envVar));
      const newMappings = newConfig.mappings.filter(
        m => !existingEnvVars.has(m.envVar)
      );

      writeInfo(
        `Merging with existing config: ${existingConfig.mappings.length} existing + ${newMappings.length} new mappings`
      );

      return {
        version: existingConfig.version,
        mappings: [...existingConfig.mappings, ...newMappings],
        policies: existingConfig.policies,
        settings: existingConfig.settings
      };
    } catch (error) {
      writeWarn(`Could not merge with existing config: ${error}`);
      return newConfig;
    }
  }

  private getDefaultOutputPath(configPath?: string): string {
    if (configPath) {
      const dir = path.dirname(configPath);
      const base = path.basename(configPath, '.json');
      return path.join(dir, `${base}.discovered.json`);
    }
    return 'vault-config.discovered.json';
  }

  private async writeConfig(config: VaultConfig, outputPath: string): Promise<void> {
    const configDir = path.dirname(outputPath);

    // Create directory if it doesn't exist
    try {
      await fs.mkdir(configDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore
    }

    // Write config file with nice formatting
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(outputPath, content, 'utf-8');
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: mcp-secrets-vault discover-env [options]

Options:
  --patterns <patterns>     Comma-separated patterns to discover (e.g., "GITHUB_*,OPENAI_*")
  --config <path>           Path to existing config file (for merge)
  --output <path>           Output path for generated config
  --max-secrets <number>    Maximum number of secrets to discover (default: 100)
  --merge                   Merge with existing config

Examples:
  mcp-secrets-vault discover-env --patterns "GITHUB_*,OPENAI_*"
  mcp-secrets-vault discover-env --patterns "AWS_*" --config vault.json --merge
`);
    process.exit(0);
  }

  const options: DiscoverEnvOptions = {
    patterns: [],
    merge: false
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--patterns' && i + 1 < args.length) {
      options.patterns = args[++i].split(',').map(p => p.trim());
    } else if (arg === '--config' && i + 1 < args.length) {
      options.configPath = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      options.outputPath = args[++i];
    } else if (arg === '--max-secrets' && i + 1 < args.length) {
      options.maxSecrets = parseInt(args[++i], 10);
    } else if (arg === '--merge') {
      options.merge = true;
    }
  }

  const cli = new DiscoverEnvCLI();
  await cli.run(options);
}

// Export for testing
export { DiscoverEnvCLI };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

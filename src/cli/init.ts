#!/usr/bin/env node

import { promises as fs } from 'fs';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { SecretDiscoveryService } from '../services/secret-discovery.service.js';
import { fmt } from '../utils/format.js';

// Use centralized color codes
const colors = {
  reset: CONFIG.ANSI_RESET,
  red: CONFIG.ANSI_RED,
  green: CONFIG.ANSI_GREEN,
  yellow: CONFIG.ANSI_YELLOW,
  blue: CONFIG.ANSI_BLUE,
  cyan: CONFIG.ANSI_CYAN,
  gray: CONFIG.ANSI_GRAY
};

// Format message with color
function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

// Print section header
function printHeader(title: string): void {
  console.log(`\n${colorize(CONFIG.CLI_SEPARATOR_LINE, 'blue')}`);
  console.log(colorize(`  ${title}`, 'cyan'));
  console.log(`${colorize(CONFIG.CLI_SEPARATOR_LINE, 'blue')}\n`);
}

export class InitCLI {
  private configPath: string;
  private discoveryPatterns: string[];

  constructor(configPath?: string, discoveryPatterns: string[] = []) {
    this.configPath = configPath || CONFIG.DEFAULT_CONFIG_FILE;
    this.discoveryPatterns = discoveryPatterns;
  }

  async run(): Promise<void> {
    printHeader(TEXT.INIT_HEADER);

    // Check if config file already exists
    try {
      await fs.access(this.configPath);
      console.log(`${TEXT.CLI_ICON_WARNING} ${colorize(TEXT.INIT_FILE_EXISTS, 'yellow')}`);
      console.log(colorize(`  ${this.configPath}`, 'gray'));
      process.exit(CONFIG.EXIT_CODE_SUCCESS);
    } catch {
      // File doesn't exist, proceed
    }

    // Check if discovery patterns provided
    if (this.discoveryPatterns.length === 0) {
      console.log(`${TEXT.CLI_ICON_ERROR} ${colorize(TEXT.INIT_NO_PATTERNS_PROVIDED, 'red')}`);
      console.log(colorize('\nExample usage:', 'yellow'));
      console.log(colorize('  npx mcp-secrets-vault --init --discover-env "GITHUB_*,OPENAI_*"', 'gray'));
      process.exit(CONFIG.EXIT_CODE_INVALID_CONFIG);
    }

    // Discover secrets
    console.log(colorize(TEXT.DISCOVER_GENERATING_CONFIG, 'blue'));
    const discoveryService = new SecretDiscoveryService();

    try {
      const discovered = discoveryService.discoverSecrets(this.discoveryPatterns);

      if (discovered.length === 0) {
        console.log(`${TEXT.CLI_ICON_WARNING} ${colorize(TEXT.DISCOVER_NO_SECRETS_FOUND, 'yellow')}`);
        process.exit(CONFIG.EXIT_CODE_SUCCESS);
      }

      console.log(`${TEXT.CLI_ICON_SUCCESS} ${colorize(
        TEXT.INIT_DISCOVERED_SECRETS.replace('{count}', discovered.length.toString()),
        'green'
      )}`);

      // Generate config
      const configContent = discoveryService.generateConfig(discovered);

      // Write to file
      console.log(colorize(`\n${TEXT.INIT_CREATING_CONFIG}`, 'blue'));
      await fs.writeFile(this.configPath, configContent, CONFIG.DEFAULT_ENCODING);

      console.log(`${TEXT.CLI_ICON_SUCCESS} ${colorize(TEXT.INIT_SUCCESS, 'green')}`);
      console.log(colorize(`  ${TEXT.DISCOVER_CONFIG_WRITTEN.replace('{path}', this.configPath)}`, 'gray'));

      // Print next steps
      console.log(colorize('\nNext steps:', 'yellow'));
      console.log(colorize('  1. Review and edit vault.config.json', 'gray'));
      console.log(colorize('  2. Add allowed domains for each secret policy', 'gray'));
      console.log(colorize('  3. Adjust rate limits as needed', 'gray'));
      console.log(colorize('  4. Run: npx mcp-secrets-vault doctor', 'gray'));

      // Security reminder
      console.log(colorize('\nSecurity reminder:', 'yellow'));
      console.log(colorize('  ⚠️  Add .env* files to .gitignore', 'red'));
      console.log(colorize('  ⚠️  Never commit secrets to version control', 'red'));

      process.exit(CONFIG.EXIT_CODE_SUCCESS);

    } catch (error: any) {
      console.log(`${TEXT.CLI_ICON_ERROR} ${colorize(TEXT.INIT_FAILED, 'red')}`);
      console.log(colorize(`  ${error.message}`, 'gray'));
      process.exit(CONFIG.EXIT_CODE_ERROR);
    }
  }
}

// Show help
function showHelp(): void {
  console.log(`
${colorize('MCP Secrets Vault - Init Command', 'cyan')}

${colorize('Description:', 'yellow')}
  ${TEXT.INIT_HELP_TEXT}

${colorize('Usage:', 'yellow')}
  npx mcp-secrets-vault --init --discover-env "PATTERN1,PATTERN2"

${colorize('Options:', 'yellow')}
  --init                    Initialize configuration file
  --discover-env PATTERNS   Comma-separated patterns (e.g., "GITHUB_*,OPENAI_*")
  --help, -h               Show this help message

${colorize('Examples:', 'yellow')}
  # Discover GitHub and OpenAI secrets
  npx mcp-secrets-vault --init --discover-env "GITHUB_*,OPENAI_*"

  # Discover all secrets starting with API_
  npx mcp-secrets-vault --init --discover-env "API_*"

  # Multiple patterns
  npx mcp-secrets-vault --init --discover-env "GITHUB_*,OPENAI_*,STRIPE_*"

${colorize('Notes:', 'yellow')}
  • Patterns use * as wildcard (e.g., GITHUB_* matches GITHUB_TOKEN)
  • Discovered secrets still require policies with allowed domains
  • Generated config is a template - review and edit before use
  • Environment variables must be set before running init
`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes(CONFIG.CLI_ARG_HELP_LONG) || args.includes(CONFIG.CLI_ARG_HELP_SHORT)) {
  showHelp();
  process.exit(CONFIG.EXIT_CODE_SUCCESS);
}

// Run init if executed directly
if (import.meta.url === `${CONFIG.FILE_URL_SCHEME}${process.argv[CONFIG.PROCESS_ARGV_FILE_INDEX]}`) {
  // Extract discovery patterns
  const discoverEnvIndex = args.indexOf(CONFIG.DISCOVER_ENV_FLAG);
  const patterns: string[] = [];

  if (discoverEnvIndex !== -1 && args[discoverEnvIndex + 1]) {
    const patternsArg = args[discoverEnvIndex + 1];
    patterns.push(...patternsArg.split(',').map(p => p.trim()));
  }

  const initCLI = new InitCLI(undefined, patterns);
  initCLI.run().catch((error) => {
    console.error(`\n${TEXT.CLI_ICON_ERROR} ${colorize(TEXT.DOCTOR_FATAL_ERROR, 'red')}`);
    console.error(colorize(error.message, 'red'));
    process.exit(CONFIG.EXIT_CODE_ERROR);
  });
}

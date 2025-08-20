#!/usr/bin/env node

import { promises as fs } from 'fs';
import { ConfigLoaderService } from '../services/config-loader.service.js';
import { ConfigValidatorService } from '../services/config-validator.service.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
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

// Print validation result
function printResult(label: string, value: string | number, indent = 0): void {
  const spaces = ' '.repeat(indent);
  console.log(`${spaces}${colorize(label + ':', 'gray')} ${value}`);
}

// Main validation function
async function validateConfig(configPath?: string): Promise<void> {
  const filePath = configPath || CONFIG.DEFAULT_CONFIG_FILE;
  
  printHeader(TEXT.VALIDATE_CONFIG_HEADER);
  console.log(`${TEXT.VALIDATE_CONFIG_VALIDATING} ${colorize(filePath, 'yellow')}`);
  
  try {
    // Check if file exists
    try {
      await fs.access(filePath);
      console.log(`${TEXT.CLI_ICON_SUCCESS} ${colorize(TEXT.VALIDATE_CONFIG_FILE_EXISTS, 'green')}`);
    } catch {
      console.log(`${TEXT.CLI_ICON_ERROR} ${colorize(TEXT.VALIDATE_CONFIG_FILE_NOT_FOUND, 'red')}`);
      console.log(`\n${colorize(TEXT.VALIDATE_CONFIG_CREATE_TIP, 'yellow')} ${TEXT.VALIDATE_CONFIG_CREATE_FILE_MSG}`);
      console.log(colorize(TEXT.VALIDATE_CONFIG_JSON_EXAMPLE, 'gray'));
      process.exit(CONFIG.EXIT_CODE_INVALID_CONFIG);
    }
    
    // Load and validate configuration
    const loader = new ConfigLoaderService(filePath);
    const validator = new ConfigValidatorService();
    
    console.log(`\n${colorize(TEXT.VALIDATE_CONFIG_LOADING, 'blue')}`);
    const config = await loader.loadConfig();
    
    // Validate structure
    console.log(`${colorize(TEXT.VALIDATE_CONFIG_VALIDATING_STRUCTURE, 'blue')}`);
    validator.validate(config);
    console.log(`${TEXT.CLI_ICON_SUCCESS} ${colorize(TEXT.VALIDATE_CONFIG_STRUCTURE_VALID, 'green')}`);
    
    // Display configuration summary
    printHeader(TEXT.VALIDATE_CONFIG_SUMMARY_HEADER);
    
    printResult(TEXT.VALIDATE_CONFIG_VERSION_LABEL, config.version);
    printResult(TEXT.VALIDATE_CONFIG_MAPPINGS_LABEL, config.mappings.length.toString());
    printResult(TEXT.VALIDATE_CONFIG_POLICIES_LABEL, config.policies.length.toString());
    
    // Validate and display mappings
    if (config.mappings.length > 0) {
      console.log(`\n${colorize(TEXT.VALIDATE_CONFIG_SECRET_MAPPINGS_HEADER, 'cyan')}`);
      for (const mapping of config.mappings) {
        console.log(`  • ${mapping.secretId} → ${colorize(mapping.envVar, 'yellow')}`);
        if (mapping.description) {
          console.log(`    ${colorize(mapping.description, 'gray')}`);
        }
      }
    }
    
    // Validate and display policies
    if (config.policies.length > 0) {
      console.log(`\n${colorize(TEXT.VALIDATE_CONFIG_ACCESS_POLICIES_HEADER, 'cyan')}`);
      for (const policy of config.policies) {
        console.log(`  • ${colorize(policy.secretId, 'yellow')}`);
        console.log(`    ${TEXT.VALIDATE_CONFIG_ACTIONS_LABEL} ${policy.allowedActions.join(', ')}`);
        console.log(`    ${TEXT.VALIDATE_CONFIG_DOMAINS_LABEL} ${policy.allowedDomains.length} ${TEXT.VALIDATE_CONFIG_EXACT_FQDNS_SUFFIX}`);
        
        // Validate each domain explicitly
        for (const domain of policy.allowedDomains) {
          try {
            validator.validateDomain(domain);
            console.log(`      ${TEXT.CLI_ICON_SUCCESS} ${domain}`);
          } catch (error: any) {
            console.log(`      ${TEXT.CLI_ICON_ERROR} ${domain} - ${colorize(error.message, 'red')}`);
          }
        }
        
        if (policy.rateLimit) {
          const rateLimitText = fmt(TEXT.VALIDATE_CONFIG_RATE_LIMIT_FORMAT, {
            requests: policy.rateLimit.requests,
            windowSeconds: policy.rateLimit.windowSeconds
          });
          console.log(`    ${TEXT.VALIDATE_CONFIG_RATE_LIMIT_LABEL} ${rateLimitText}`);
        }
        if (policy.expiresAt) {
          console.log(`    ${TEXT.VALIDATE_CONFIG_EXPIRES_LABEL} ${policy.expiresAt}`);
        }
      }
    }
    
    // Check for duplicate secret IDs
    console.log(`\n${colorize(TEXT.VALIDATE_CONFIG_CHECKING_DUPLICATES, 'blue')}`);
    validator.checkDuplicateSecretIds(config.mappings, config.policies);
    console.log(`${TEXT.CLI_ICON_SUCCESS} ${colorize(TEXT.VALIDATE_CONFIG_NO_DUPLICATES, 'green')}`);
    
    // Display settings
    if (config.settings) {
      console.log(`\n${colorize(TEXT.VALIDATE_CONFIG_SETTINGS_HEADER, 'cyan')}`);
      if (config.settings.auditDir) {
        printResult(TEXT.VALIDATE_CONFIG_AUDIT_DIR_LABEL, config.settings.auditDir, 2);
      }
      if (config.settings.maxFileSizeMb) {
        printResult(TEXT.VALIDATE_CONFIG_MAX_FILE_SIZE_LABEL, `${config.settings.maxFileSizeMb} ${TEXT.VALIDATE_CONFIG_MAX_FILE_SIZE_SUFFIX}`, 2);
      }
      if (config.settings.maxFileAgeDays) {
        printResult(TEXT.VALIDATE_CONFIG_MAX_FILE_AGE_LABEL, `${config.settings.maxFileAgeDays} ${TEXT.VALIDATE_CONFIG_MAX_FILE_AGE_SUFFIX}`, 2);
      }
      if (config.settings.defaultRateLimit) {
        const rateLimitText = fmt(TEXT.VALIDATE_CONFIG_RATE_LIMIT_FORMAT, {
          requests: config.settings.defaultRateLimit.requests,
          windowSeconds: config.settings.defaultRateLimit.windowSeconds
        });
        printResult(TEXT.VALIDATE_CONFIG_DEFAULT_RATE_LIMIT_LABEL, rateLimitText, 2);
      }
    }
    
    // Important reminders
    printHeader(TEXT.VALIDATE_CONFIG_SECURITY_NOTES_HEADER);
    console.log(`${TEXT.VALIDATE_CONFIG_IMPORTANT_LABEL}`);
    console.log(`  ${TEXT.VALIDATE_CONFIG_NOTE_EXACT_FQDNS}`);
    console.log(`  ${TEXT.VALIDATE_CONFIG_NOTE_ENV_NOT_CHECKED}`);
    console.log(`  ${TEXT.VALIDATE_CONFIG_NOTE_USE_DOCTOR}`);
    console.log(`  ${TEXT.VALIDATE_CONFIG_NOTE_DENY_BY_DEFAULT}`);
    
    // Success message
    console.log(`\n${colorize(CONFIG.CLI_SEPARATOR_LINE_THIN, 'green')}`);
    console.log(`${TEXT.CLI_ICON_SUCCESS} ${colorize(TEXT.VALIDATE_CONFIG_SUCCESS, 'green')}`);
    console.log(`${colorize(CONFIG.CLI_SEPARATOR_LINE_THIN, 'green')}\n`);
    
    process.exit(CONFIG.EXIT_CODE_SUCCESS);
    
  } catch (error: any) {
    console.error(`\n${TEXT.CLI_ICON_ERROR} ${colorize(TEXT.VALIDATE_CONFIG_VALIDATION_FAILED, 'red')}`);
    console.error(colorize(error.message, 'red'));
    
    // Provide helpful tips based on error
    if (error.message.includes('Wildcards not allowed')) {
      console.log(`\n${colorize(TEXT.VALIDATE_CONFIG_CREATE_TIP, 'yellow')} ${TEXT.VALIDATE_CONFIG_WILDCARDS_TIP}`);
      console.log(colorize(`  ${TEXT.VALIDATE_CONFIG_WILDCARDS_INSTEAD_OF}`, 'gray'));
      console.log(colorize(`  ${TEXT.VALIDATE_CONFIG_WILDCARDS_USE}`, 'gray'));
    }
    
    if (error.message.includes('Invalid JSON')) {
      console.log(`\n${colorize(TEXT.VALIDATE_CONFIG_CREATE_TIP, 'yellow')} ${TEXT.VALIDATE_CONFIG_JSON_TIP}`);
    }
    
    process.exit(CONFIG.EXIT_CODE_INVALID_CONFIG);
  }
}

// Parse command line arguments
const args = process.argv.slice(CONFIG.PROCESS_ARGV_FILE_INDEX + 1);
const configPath = args[0];

if (args.includes(CONFIG.CLI_ARG_HELP_LONG) || args.includes(CONFIG.CLI_ARG_HELP_SHORT)) {
  console.log(`
${colorize(TEXT.VALIDATE_CONFIG_HELP_HEADER, 'cyan')}

${colorize(TEXT.VALIDATE_CONFIG_HELP_USAGE_LABEL, 'yellow')}
  ${TEXT.VALIDATE_CONFIG_HELP_USAGE}

${colorize(TEXT.VALIDATE_CONFIG_HELP_ARGUMENTS_LABEL, 'yellow')}
  ${TEXT.VALIDATE_CONFIG_HELP_CONFIG_FILE}

${colorize(TEXT.VALIDATE_CONFIG_HELP_EXAMPLES_LABEL, 'yellow')}
  ${TEXT.VALIDATE_CONFIG_HELP_EXAMPLE_DEFAULT}
  ${TEXT.VALIDATE_CONFIG_HELP_EXAMPLE_CUSTOM}
  ${TEXT.VALIDATE_CONFIG_HELP_EXAMPLE_HELP}

${colorize(TEXT.VALIDATE_CONFIG_HELP_EXIT_CODES_LABEL, 'yellow')}
  ${TEXT.VALIDATE_CONFIG_HELP_EXIT_0}
  ${TEXT.VALIDATE_CONFIG_HELP_EXIT_2}
`);
  process.exit(CONFIG.EXIT_CODE_SUCCESS);
}

// Run validation
validateConfig(configPath);
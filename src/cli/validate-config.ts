#!/usr/bin/env node

import { promises as fs } from 'fs';
import { ConfigLoaderService } from '../services/config-loader.service.js';
import { ConfigValidatorService } from '../services/config-validator.service.js';
import { CONFIG } from '../constants/config-constants.js';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Format message with color
function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

// Print section header
function printHeader(title: string): void {
  console.log(`\n${colorize('═'.repeat(60), 'blue')}`);
  console.log(colorize(`  ${title}`, 'cyan'));
  console.log(`${colorize('═'.repeat(60), 'blue')}\n`);
}

// Print validation result
function printResult(label: string, value: string | number, indent = 0): void {
  const spaces = ' '.repeat(indent);
  console.log(`${spaces}${colorize(label + ':', 'gray')} ${value}`);
}

// Main validation function
async function validateConfig(configPath?: string): Promise<void> {
  const filePath = configPath || CONFIG.DEFAULT_CONFIG_FILE;
  
  printHeader('MCP Secrets Vault - Configuration Validator');
  console.log(`Validating: ${colorize(filePath, 'yellow')}`);
  
  try {
    // Check if file exists
    try {
      await fs.access(filePath);
      console.log(`✅ ${colorize('File exists', 'green')}`);
    } catch {
      console.log(`❌ ${colorize('File not found', 'red')}`);
      console.log(`\n${colorize('Tip:', 'yellow')} Create a vault.config.json file with the following structure:`);
      console.log(colorize(`
{
  "version": "1.0.0",
  "mappings": [],
  "policies": [],
  "settings": {}
}`, 'gray'));
      process.exit(CONFIG.EXIT_CODE_INVALID_CONFIG);
    }
    
    // Load and validate configuration
    const loader = new ConfigLoaderService(filePath);
    const validator = new ConfigValidatorService();
    
    console.log(`\n${colorize('Loading configuration...', 'blue')}`);
    const config = await loader.loadConfig();
    
    // Validate structure
    console.log(`${colorize('Validating structure...', 'blue')}`);
    validator.validate(config);
    console.log(`✅ ${colorize('Configuration structure is valid', 'green')}`);
    
    // Display configuration summary
    printHeader('Configuration Summary');
    
    printResult('Version', config.version);
    printResult('Mappings', config.mappings.length.toString());
    printResult('Policies', config.policies.length.toString());
    
    // Validate and display mappings
    if (config.mappings.length > 0) {
      console.log(`\n${colorize('Secret Mappings:', 'cyan')}`);
      for (const mapping of config.mappings) {
        console.log(`  • ${mapping.secretId} → ${colorize(mapping.envVar, 'yellow')}`);
        if (mapping.description) {
          console.log(`    ${colorize(mapping.description, 'gray')}`);
        }
      }
    }
    
    // Validate and display policies
    if (config.policies.length > 0) {
      console.log(`\n${colorize('Access Policies:', 'cyan')}`);
      for (const policy of config.policies) {
        console.log(`  • ${colorize(policy.secretId, 'yellow')}`);
        console.log(`    Actions: ${policy.allowedActions.join(', ')}`);
        console.log(`    Domains: ${policy.allowedDomains.length} exact FQDNs`);
        
        // Validate each domain explicitly
        for (const domain of policy.allowedDomains) {
          try {
            validator.validateDomain(domain);
            console.log(`      ✅ ${domain}`);
          } catch (error: any) {
            console.log(`      ❌ ${domain} - ${colorize(error.message, 'red')}`);
          }
        }
        
        if (policy.rateLimit) {
          console.log(`    Rate Limit: ${policy.rateLimit.requests} requests per ${policy.rateLimit.windowSeconds}s`);
        }
        if (policy.expiresAt) {
          console.log(`    Expires: ${policy.expiresAt}`);
        }
      }
    }
    
    // Check for duplicate secret IDs
    console.log(`\n${colorize('Checking for duplicates...', 'blue')}`);
    validator.checkDuplicateSecretIds(config.mappings, config.policies);
    console.log(`✅ ${colorize('No duplicate secret IDs found', 'green')}`);
    
    // Display settings
    if (config.settings) {
      console.log(`\n${colorize('Settings:', 'cyan')}`);
      if (config.settings.auditDir) {
        printResult('Audit Directory', config.settings.auditDir, 2);
      }
      if (config.settings.maxFileSizeMb) {
        printResult('Max File Size', `${config.settings.maxFileSizeMb} MB`, 2);
      }
      if (config.settings.maxFileAgeDays) {
        printResult('Max File Age', `${config.settings.maxFileAgeDays} days`, 2);
      }
      if (config.settings.defaultRateLimit) {
        printResult('Default Rate Limit', 
          `${config.settings.defaultRateLimit.requests} requests per ${config.settings.defaultRateLimit.windowSeconds}s`, 
          2);
      }
    }
    
    // Important reminders
    printHeader('Security Notes');
    console.log(`${colorize('⚠️  Important:', 'yellow')}`);
    console.log('  • All domains must be exact FQDNs (no wildcards)');
    console.log('  • Environment variables are NOT checked by this validator');
    console.log('  • Use the doctor CLI (Task-17) to verify environment setup');
    console.log('  • Configuration follows deny-by-default security posture');
    
    // Success message
    console.log(`\n${colorize('━'.repeat(60), 'green')}`);
    console.log(`✅ ${colorize('Configuration is valid!', 'green')}`);
    console.log(`${colorize('━'.repeat(60), 'green')}\n`);
    
    process.exit(CONFIG.EXIT_CODE_SUCCESS);
    
  } catch (error: any) {
    console.error(`\n❌ ${colorize('Validation failed:', 'red')}`);
    console.error(colorize(error.message, 'red'));
    
    // Provide helpful tips based on error
    if (error.message.includes('Wildcards not allowed')) {
      console.log(`\n${colorize('Tip:', 'yellow')} List each domain explicitly. For example:`);
      console.log(colorize('  Instead of: "*.example.com"', 'gray'));
      console.log(colorize('  Use: ["api.example.com", "www.example.com", "app.example.com"]', 'gray'));
    }
    
    if (error.message.includes('Invalid JSON')) {
      console.log(`\n${colorize('Tip:', 'yellow')} Check your JSON syntax with a JSON validator`);
    }
    
    process.exit(CONFIG.EXIT_CODE_INVALID_CONFIG);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const configPath = args[0];

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${colorize('MCP Secrets Vault - Configuration Validator', 'cyan')}

${colorize('Usage:', 'yellow')}
  validate-config [config-file]

${colorize('Arguments:', 'yellow')}
  config-file    Path to configuration file (default: vault.config.json)

${colorize('Examples:', 'yellow')}
  validate-config                    # Validate default vault.config.json
  validate-config my-config.json     # Validate specific file
  validate-config --help             # Show this help message

${colorize('Exit Codes:', 'yellow')}
  0    Configuration is valid
  2    Configuration is invalid
`);
  process.exit(CONFIG.EXIT_CODE_SUCCESS);
}

// Run validation
validateConfig(configPath);
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

interface DiagnosticResult {
  check: string;
  status: typeof CONFIG.CLI_STATUS_OK | typeof CONFIG.CLI_STATUS_WARN | typeof CONFIG.CLI_STATUS_ERROR;
  message: string;
  details?: string[];
}

interface DiagnosticSummary {
  total: number;
  passed: number;
  warnings: number;
  errors: number;
}

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

// Print diagnostic result
function printResult(result: DiagnosticResult): void {
  const statusColor = result.status === CONFIG.CLI_STATUS_OK ? 'green' : 
                      result.status === CONFIG.CLI_STATUS_WARN ? 'yellow' : 'red';
  const statusIcon = result.status === CONFIG.CLI_STATUS_OK ? TEXT.CLI_ICON_SUCCESS : 
                     result.status === CONFIG.CLI_STATUS_WARN ? TEXT.CLI_ICON_WARNING : TEXT.CLI_ICON_ERROR;
  
  console.log(`${statusIcon} ${colorize(result.status, statusColor)} - ${result.check}`);
  console.log(`  ${colorize(result.message, 'gray')}`);
  
  if (result.details && result.details.length > 0) {
    result.details.forEach(detail => {
      console.log(`    • ${colorize(detail, 'gray')}`);
    });
  }
}

// Doctor CLI main class
export class DoctorCLI {
  private results: DiagnosticResult[] = [];
  private configPath: string;
  
  constructor(configPath?: string) {
    this.configPath = configPath || CONFIG.DEFAULT_CONFIG_FILE;
  }
  
  async run(): Promise<void> {
    printHeader(TEXT.DOCTOR_HEADER);
    console.log(colorize(fmt(TEXT.DOCTOR_ANALYZING, { path: this.configPath }), 'yellow') + '\n');
    
    // Run all diagnostic checks
    await this.checkConfigSchema();
    await this.checkEnvironmentVariables();
    await this.checkDomainConfigurations();
    await this.checkRateLimits();
    await this.checkAuditDirectory();
    await this.checkPolicyExpiration();
    
    // Print summary
    this.printSummary();
    
    // Exit with appropriate code
    const summary = this.getSummary();
    if (summary.errors > 0) {
      process.exit(CONFIG.EXIT_CODE_INVALID_CONFIG);
    } else if (summary.warnings > 0) {
      process.exit(CONFIG.EXIT_CODE_SUCCESS);
    } else {
      process.exit(CONFIG.EXIT_CODE_SUCCESS);
    }
  }
  
  private async checkConfigSchema(): Promise<void> {
    console.log(colorize(TEXT.DOCTOR_CHECKING_CONFIG, 'blue'));
    
    try {
      await fs.access(this.configPath);
      const loader = new ConfigLoaderService(this.configPath);
      const validator = new ConfigValidatorService();
      const config = await loader.loadConfig();
      validator.validate(config);
      
      this.results.push({
        check: TEXT.DOCTOR_CHECK_CONFIG_SCHEMA,
        status: CONFIG.CLI_STATUS_OK,
        message: TEXT.DOCTOR_CONFIG_VALID,
        details: [
          fmt(TEXT.DOCTOR_VERSION_INFO, { version: config.version }),
          fmt(TEXT.DOCTOR_MAPPINGS_INFO, { count: config.mappings.length }),
          fmt(TEXT.DOCTOR_POLICIES_INFO, { count: config.policies.length })
        ]
      });
    } catch (error: any) {
      if (error.code === CONFIG.FS_ERROR_ENOENT) {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_CONFIG_SCHEMA,
          status: CONFIG.CLI_STATUS_ERROR,
          message: TEXT.DOCTOR_CONFIG_NOT_FOUND,
          details: [fmt(TEXT.DOCTOR_FILE_NOT_FOUND, { path: this.configPath })]
        });
      } else {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_CONFIG_SCHEMA,
          status: CONFIG.CLI_STATUS_ERROR,
          message: TEXT.DOCTOR_CONFIG_INVALID,
          details: [error.message]
        });
      }
    }
  }
  
  private async checkEnvironmentVariables(): Promise<void> {
    console.log(colorize(TEXT.DOCTOR_CHECKING_ENV_VARS, 'blue'));
    
    try {
      const loader = new ConfigLoaderService(this.configPath);
      const config = await loader.loadConfig();
      
      const missingVars: string[] = [];
      const setVars: string[] = [];
      
      for (const mapping of config.mappings) {
        if (process.env[mapping.envVar]) {
          setVars.push(mapping.secretId);
        } else {
          missingVars.push(mapping.secretId);
        }
      }
      
      if (missingVars.length === 0) {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_ENV_VARS,
          status: CONFIG.CLI_STATUS_OK,
          message: fmt(TEXT.DOCTOR_ENV_ALL_SET, { count: setVars.length }),
          details: setVars
        });
      } else if (missingVars.length < config.mappings.length) {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_ENV_VARS,
          status: CONFIG.CLI_STATUS_WARN,
          message: TEXT.DOCTOR_SECRET_NOT_IN_ENV,
          details: missingVars
        });
      } else {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_ENV_VARS,
          status: CONFIG.CLI_STATUS_ERROR,
          message: TEXT.DOCTOR_ENV_NONE_SET,
          details: missingVars
        });
      }
    } catch {
      // Config error already reported
    }
  }
  
  private async checkDomainConfigurations(): Promise<void> {
    console.log(colorize(TEXT.DOCTOR_CHECKING_DOMAINS, 'blue'));
    
    try {
      const loader = new ConfigLoaderService(this.configPath);
      const config = await loader.loadConfig();
      
      const domainIssues: string[] = [];
      const allDomains = new Set<string>();
      
      for (const policy of config.policies) {
        // Check for duplicate domains
        for (const domain of policy.allowedDomains) {
          if (allDomains.has(domain)) {
            domainIssues.push(`${TEXT.DOCTOR_DOMAIN_DUPLICATE}: ${domain}`);
          }
          allDomains.add(domain);
          
          // Check for suspicious patterns
          for (const pattern of CONFIG.DOCTOR_SUSPICIOUS_DOMAIN_PATTERNS) {
            if (domain.includes(pattern)) {
              domainIssues.push(`${TEXT.DOCTOR_DOMAIN_SUSPICIOUS}: ${domain}`);
            }
          }
        }
        
        // Check domain count
        if (policy.allowedDomains.length < CONFIG.DOCTOR_MIN_DOMAIN_COUNT) {
          domainIssues.push(fmt(TEXT.DOCTOR_NO_DOMAINS_CONFIGURED, { secretId: policy.secretId }));
        }
        if (policy.allowedDomains.length > CONFIG.DOCTOR_MAX_DOMAIN_COUNT) {
          domainIssues.push(fmt(TEXT.DOCTOR_TOO_MANY_DOMAINS, { secretId: policy.secretId, count: policy.allowedDomains.length }));
        }
      }
      
      if (domainIssues.length === 0) {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_DOMAINS,
          status: CONFIG.CLI_STATUS_OK,
          message: TEXT.DOCTOR_DOMAIN_VALID,
          details: [fmt(TEXT.DOCTOR_DOMAIN_COUNT_INFO, { count: allDomains.size })]
        });
      } else {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_DOMAINS,
          status: CONFIG.CLI_STATUS_WARN,
          message: TEXT.DOCTOR_DOMAIN_HAS_ISSUES,
          details: domainIssues
        });
      }
    } catch {
      // Config error already reported
    }
  }
  
  private async checkRateLimits(): Promise<void> {
    console.log(colorize(TEXT.DOCTOR_CHECKING_LIMITS, 'blue'));
    
    try {
      const loader = new ConfigLoaderService(this.configPath);
      const config = await loader.loadConfig();
      
      const limitIssues: string[] = [];
      
      for (const policy of config.policies) {
        if (policy.rateLimit) {
          const { requests, windowSeconds } = policy.rateLimit;
          
          if (requests < CONFIG.DOCTOR_RATE_LIMIT_MIN_REQUESTS) {
            limitIssues.push(`${policy.secretId}: ${TEXT.DOCTOR_LIMIT_TOO_LOW} (${requests} requests)`);
          }
          if (requests > CONFIG.DOCTOR_RATE_LIMIT_MAX_REQUESTS) {
            limitIssues.push(`${policy.secretId}: ${TEXT.DOCTOR_LIMIT_TOO_HIGH} (${requests} requests)`);
          }
          if (windowSeconds < CONFIG.DOCTOR_RATE_LIMIT_MIN_WINDOW) {
            limitIssues.push(`${policy.secretId}: ${fmt(TEXT.DOCTOR_LIMIT_WINDOW_SHORT, { seconds: windowSeconds })}`);
          }
          if (windowSeconds > CONFIG.DOCTOR_RATE_LIMIT_MAX_WINDOW) {
            limitIssues.push(`${policy.secretId}: ${fmt(TEXT.DOCTOR_LIMIT_WINDOW_LONG, { seconds: windowSeconds })}`);
          }
        }
      }
      
      if (limitIssues.length === 0) {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_RATE_LIMITS,
          status: CONFIG.CLI_STATUS_OK,
          message: TEXT.DOCTOR_LIMIT_REASONABLE
        });
      } else {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_RATE_LIMITS,
          status: CONFIG.CLI_STATUS_WARN,
          message: TEXT.DOCTOR_LIMITS_NEED_ADJUSTMENT,
          details: limitIssues
        });
      }
    } catch {
      // Config error already reported
    }
  }
  
  private async checkAuditDirectory(): Promise<void> {
    try {
      const loader = new ConfigLoaderService(this.configPath);
      const config = await loader.loadConfig();
      const auditDir = config.settings?.auditDir || CONFIG.DEFAULT_AUDIT_DIR;
      
      try {
        await fs.access(auditDir, fs.constants.W_OK);
        
        const warnings: string[] = [];
        if (config.settings?.maxFileSizeMb && config.settings.maxFileSizeMb > CONFIG.DOCTOR_FILE_SIZE_WARN_MB) {
          warnings.push(TEXT.DOCTOR_FILE_SIZE_WARNING);
        }
        if (config.settings?.maxFileAgeDays && config.settings.maxFileAgeDays > CONFIG.DOCTOR_FILE_AGE_WARN_DAYS) {
          warnings.push(TEXT.DOCTOR_FILE_AGE_WARNING);
        }
        
        if (warnings.length > 0) {
          this.results.push({
            check: TEXT.DOCTOR_CHECK_AUDIT_DIR,
            status: CONFIG.CLI_STATUS_WARN,
            message: TEXT.DOCTOR_AUDIT_WRITABLE_WITH_WARNINGS,
            details: warnings
          });
        } else {
          this.results.push({
            check: TEXT.DOCTOR_CHECK_AUDIT_DIR,
            status: CONFIG.CLI_STATUS_OK,
            message: fmt(TEXT.DOCTOR_AUDIT_WRITABLE, { path: auditDir })
          });
        }
      } catch {
        // Try to create it
        try {
          await fs.mkdir(auditDir, { recursive: true });
          this.results.push({
            check: TEXT.DOCTOR_CHECK_AUDIT_DIR,
            status: CONFIG.CLI_STATUS_OK,
            message: TEXT.DOCTOR_AUDIT_DIR_CREATED,
            details: [`Created: ${auditDir}`]
          });
        } catch (error: any) {
          this.results.push({
            check: TEXT.DOCTOR_CHECK_AUDIT_DIR,
            status: CONFIG.CLI_STATUS_ERROR,
            message: TEXT.DOCTOR_AUDIT_DIR_NOT_WRITABLE,
            details: [error.message]
          });
        }
      }
    } catch {
      // Config error already reported
    }
  }
  
  private async checkPolicyExpiration(): Promise<void> {
    try {
      const loader = new ConfigLoaderService(this.configPath);
      const config = await loader.loadConfig();
      
      const expirationIssues: string[] = [];
      const now = new Date();
      const soonThreshold = new Date(now.getTime() + CONFIG.DOCTOR_POLICY_EXPIRING_SOON_DAYS * CONFIG.MS_PER_DAY);
      
      for (const policy of config.policies) {
        if (policy.expiresAt) {
          const expiryDate = new Date(policy.expiresAt);
          if (expiryDate < now) {
            expirationIssues.push(`${policy.secretId}: ${TEXT.DOCTOR_EXPIRED_POLICY}`);
          } else if (expiryDate < soonThreshold) {
            expirationIssues.push(`${policy.secretId}: ${TEXT.DOCTOR_EXPIRING_SOON} (${policy.expiresAt})`);
          }
        }
      }
      
      // Check for policies without mappings
      const mappedSecrets = new Set(config.mappings.map(m => m.secretId));
      for (const policy of config.policies) {
        if (!mappedSecrets.has(policy.secretId)) {
          expirationIssues.push(`${policy.secretId}: ${TEXT.DOCTOR_POLICY_WITHOUT_MAPPING}`);
        }
      }
      
      // Check for mappings without policies
      const policySecrets = new Set(config.policies.map(p => p.secretId));
      for (const mapping of config.mappings) {
        if (!policySecrets.has(mapping.secretId)) {
          expirationIssues.push(`${mapping.secretId}: ${TEXT.DOCTOR_NO_POLICIES}`);
        }
      }
      
      if (expirationIssues.length === 0) {
        this.results.push({
          check: TEXT.DOCTOR_CHECK_POLICY_STATUS,
          status: CONFIG.CLI_STATUS_OK,
          message: TEXT.DOCTOR_POLICIES_ALL_VALID
        });
      } else {
        const hasErrors = expirationIssues.some(issue => 
          issue.includes(TEXT.DOCTOR_EXPIRED_POLICY) || 
          issue.includes(TEXT.DOCTOR_NO_POLICIES)
        );
        
        this.results.push({
          check: TEXT.DOCTOR_CHECK_POLICY_STATUS,
          status: hasErrors ? CONFIG.CLI_STATUS_ERROR : CONFIG.CLI_STATUS_WARN,
          message: TEXT.DOCTOR_POLICIES_NEED_ATTENTION,
          details: expirationIssues
        });
      }
    } catch {
      // Config error already reported
    }
  }
  
  private getSummary(): DiagnosticSummary {
    return {
      total: this.results.length,
      passed: this.results.filter(r => r.status === CONFIG.CLI_STATUS_OK).length,
      warnings: this.results.filter(r => r.status === CONFIG.CLI_STATUS_WARN).length,
      errors: this.results.filter(r => r.status === CONFIG.CLI_STATUS_ERROR).length
    };
  }
  
  private printSummary(): void {
    console.log('\n');
    this.results.forEach(result => printResult(result));
    
    printHeader(TEXT.DOCTOR_SUMMARY_HEADER);
    
    const summary = this.getSummary();
    console.log(`${TEXT.DOCTOR_TOTAL_CHECKS}: ${summary.total}`);
    console.log(`${colorize(TEXT.DOCTOR_PASSED_CHECKS, 'green')}: ${summary.passed}`);
    console.log(`${colorize(TEXT.DOCTOR_WARNINGS, 'yellow')}: ${summary.warnings}`);
    console.log(`${colorize(TEXT.DOCTOR_ERRORS, 'red')}: ${summary.errors}`);
    
    console.log(`\n${colorize(CONFIG.CLI_SEPARATOR_LINE_THIN, summary.errors > 0 ? 'red' : summary.warnings > 0 ? 'yellow' : 'green')}`);
    
    if (summary.errors === 0 && summary.warnings === 0) {
      console.log(`${TEXT.CLI_ICON_SUCCESS} ${colorize(TEXT.DOCTOR_CHECK_PASSED, 'green')}`);
    } else if (summary.errors === 0) {
      console.log(`${TEXT.CLI_ICON_WARNING} ${colorize(TEXT.DOCTOR_CHECK_WARNINGS, 'yellow')}`);
    } else {
      console.log(`${TEXT.CLI_ICON_ERROR} ${colorize(TEXT.DOCTOR_CHECK_ERRORS, 'red')}`);
    }
    
    console.log(`${colorize(CONFIG.CLI_SEPARATOR_LINE_THIN, summary.errors > 0 ? 'red' : summary.warnings > 0 ? 'yellow' : 'green')}\n`);
  }
}

// Parse command line arguments
const args = process.argv.slice(CONFIG.PROCESS_ARGV_FILE_INDEX + 1);
const configPath = args[0];

if (args.includes(CONFIG.CLI_ARG_HELP_LONG) || args.includes(CONFIG.CLI_ARG_HELP_SHORT)) {
  console.log(`
${colorize(TEXT.DOCTOR_HELP_HEADER, 'cyan')}

${colorize(TEXT.DOCTOR_HELP_DESCRIPTION, 'yellow')}
  ${TEXT.DOCTOR_HELP_TEXT}

${colorize(TEXT.DOCTOR_HELP_USAGE, 'yellow')}
  doctor [config-file]

${colorize(TEXT.DOCTOR_HELP_ARGUMENTS, 'yellow')}
  ${TEXT.DOCTOR_HELP_CONFIG_ARG}

${colorize(TEXT.DOCTOR_HELP_EXAMPLES, 'yellow')}
  ${TEXT.DOCTOR_HELP_EXAMPLE_DEFAULT}
  ${TEXT.DOCTOR_HELP_EXAMPLE_CUSTOM}
  ${TEXT.DOCTOR_HELP_EXAMPLE_HELP}

${colorize(TEXT.DOCTOR_HELP_EXIT_CODES, 'yellow')}
  ${TEXT.DOCTOR_HELP_EXIT_0}
  ${TEXT.DOCTOR_HELP_EXIT_2}

${colorize(TEXT.DOCTOR_HELP_CHECKS, 'yellow')}
  ${TEXT.DOCTOR_HELP_CHECK_LIST}
`);
  process.exit(CONFIG.EXIT_CODE_SUCCESS);
}

// Run diagnostics if executed directly
if (import.meta.url === `${CONFIG.FILE_URL_SCHEME}${process.argv[CONFIG.PROCESS_ARGV_FILE_INDEX]}`) {
  const doctor = new DoctorCLI(configPath);
  doctor.run().catch((error) => {
    console.error(`\n${TEXT.CLI_ICON_ERROR} ${colorize(TEXT.DOCTOR_FATAL_ERROR, 'red')}`);
    console.error(colorize(error.message, 'red'));
    process.exit(CONFIG.EXIT_CODE_ERROR);
  });
}
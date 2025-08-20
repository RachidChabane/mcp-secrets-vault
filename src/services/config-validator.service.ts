import { z } from 'zod';
import { VaultConfigSchema, containsWildcards } from '../schemas/config.schema.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { ToolError } from '../utils/errors.js';

export interface ConfigValidator {
  validate(data: unknown): void;
  validateDomain(domain: string): void;
  validateSecretId(secretId: string): void;
}

export class ConfigValidatorService implements ConfigValidator {
  /**
   * Validate entire configuration structure
   * NO environment variable checking - that's for Task-17 (Doctor CLI)
   */
  validate(data: unknown): void {
    try {
      VaultConfigSchema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = this.formatZodErrors(error);
        throw new ToolError(
          `Configuration validation failed:\n${messages.join('\n')}`,
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
      throw error;
    }
  }

  /**
   * Validate a single domain with explicit wildcard rejection
   */
  validateDomain(domain: string): void {
    const trimmed = domain.trim().toLowerCase();
    
    // Explicit wildcard rejection with clear message (check first!)
    if (containsWildcards(trimmed)) {
      throw new ToolError(
        "Wildcards not allowed. Use exact FQDNs only (e.g., 'api.example.com')",
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    // Length validation
    if (trimmed.length < CONFIG.MIN_DOMAIN_LENGTH) {
      throw new ToolError(
        TEXT.ERROR_INVALID_DOMAIN_FORMAT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    if (trimmed.length > CONFIG.MAX_DOMAIN_LENGTH) {
      throw new ToolError(
        TEXT.ERROR_INVALID_DOMAIN_FORMAT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    // Reject trailing dots and embedded whitespace
    if (trimmed.endsWith('.') || /\s/.test(trimmed)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_DOMAIN_FORMAT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    // Must match exact FQDN pattern
    if (!CONFIG.DOMAIN_REGEX.test(trimmed)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_DOMAIN_FORMAT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
  }

  /**
   * Validate a secret ID
   */
  validateSecretId(secretId: string): void {
    const trimmed = secretId.trim();
    
    if (trimmed.length < CONFIG.MIN_SECRET_ID_LENGTH) {
      throw new ToolError(
        TEXT.ERROR_SECRET_ID_TOO_SHORT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    if (trimmed.length > CONFIG.MAX_SECRET_ID_LENGTH) {
      throw new ToolError(
        TEXT.ERROR_SECRET_ID_TOO_LONG,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    if (!CONFIG.SECRET_ID_REGEX.test(trimmed)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_SECRET_ID_FORMAT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
  }

  /**
   * Format Zod errors into user-friendly messages
   */
  private formatZodErrors(error: z.ZodError): string[] {
    const messages: string[] = [];
    
    for (const issue of error.errors) {
      const path = issue.path.join('.');
      let message = issue.message;
      
      // Enhance certain error messages for clarity
      if (message.includes('Wildcards not allowed')) {
        message = `${path}: ${message}`;
      } else if (path.includes('allowedDomains') && issue.code === 'invalid_string') {
        message = `${path}: Domain must be an exact FQDN (no wildcards). Example: 'api.example.com'`;
      } else if (path.includes('allowedActions') && issue.code === 'invalid_enum_value') {
        const supportedActions = CONFIG.SUPPORTED_ACTIONS.join(', ');
        message = `${path}: Invalid action. Supported actions: ${supportedActions}`;
      } else if (path === 'version' && issue.code === 'invalid_literal') {
        message = `${path}: Must be '1.0.0' (current schema version)`;
      } else {
        message = `${path}: ${message}`;
      }
      
      messages.push(message);
    }
    
    // Add helpful context if there are domain-related errors
    if (messages.some(m => m.includes('Domain') || m.includes('allowedDomains'))) {
      messages.push('\nNote: All domains must be exact FQDNs. Wildcards (*, ?, []) are not allowed.');
    }
    
    return messages;
  }

  /**
   * Check for duplicate secret IDs across mappings and policies
   */
  checkDuplicateSecretIds(mappings: ReadonlyArray<{secretId: string}>, policies: ReadonlyArray<{secretId: string}>): void {
    const seenIds = new Set<string>();
    
    // Check mappings
    for (const mapping of mappings) {
      const id = mapping.secretId.trim();
      if (seenIds.has(id)) {
        throw new ToolError(
          `Duplicate secret ID found: ${id}`,
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
      seenIds.add(id);
    }
    
    // Check policies
    const policyIds = new Set<string>();
    for (const policy of policies) {
      const id = policy.secretId.trim();
      if (policyIds.has(id)) {
        throw new ToolError(
          `Duplicate policy for secret ID: ${id}`,
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
      policyIds.add(id);
    }
  }
}
import { PolicyConfig, PolicyValidator } from '../interfaces/policy.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { z } from 'zod';
import { ToolError } from '../utils/errors.js';

// Zod schemas for validation
const RateLimitSchema = z.object({
  requests: z.number().positive(),
  windowSeconds: z.number().positive()
});

const PolicyStructureSchema = z.object({}).passthrough();

export class PolicyValidatorService implements PolicyValidator {
  private readonly seenSecretIds = new Set<string>();

  validate(policy: PolicyConfig): void {
    this.validateStructure(policy);
    this.validateSecretId(policy.secretId);
    this.validateAllowedActions(policy.allowedActions);
    this.validateAllowedDomains(policy.allowedDomains);
    
    if (policy.rateLimit) {
      this.validateRateLimit(policy.rateLimit);
    }
    
    if (policy.expiresAt) {
      this.validateExpiration(policy.expiresAt);
    }
  }

  validateAll(policies: PolicyConfig[]): void {
    this.seenSecretIds.clear();
    
    for (const policy of policies) {
      this.validate(policy);
      
      const trimmedId = policy.secretId?.trim();
      if (trimmedId && this.seenSecretIds.has(trimmedId)) {
        throw new ToolError(TEXT.ERROR_DUPLICATE_POLICY, CONFIG.ERROR_CODE_INVALID_POLICY);
      }
      
      if (trimmedId) {
        this.seenSecretIds.add(trimmedId);
      }
    }
  }

  private validateStructure(policy: PolicyConfig): void {
    try {
      // Use Zod to validate it's an object
      PolicyStructureSchema.parse(policy);
    } catch {
      throw new ToolError(TEXT.ERROR_INVALID_POLICY_STRUCTURE, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
    
    const requiredFields: (keyof PolicyConfig)[] = [
      TEXT.FIELD_SECRET_ID as keyof PolicyConfig,
      TEXT.FIELD_ALLOWED_ACTIONS as keyof PolicyConfig,
      TEXT.FIELD_ALLOWED_DOMAINS as keyof PolicyConfig
    ];
    
    for (const field of requiredFields) {
      if (!(field in policy)) {
        throw new ToolError(
          `${TEXT.ERROR_MISSING_POLICY_FIELD}: ${field}`,
          CONFIG.ERROR_CODE_INVALID_POLICY
        );
      }
    }
  }

  private validateSecretId(secretId: string): void {
    const trimmed = secretId?.trim();
    
    if (!trimmed) {
      throw new ToolError(TEXT.ERROR_SECRET_ID_TOO_SHORT, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
    
    if (trimmed.length > CONFIG.MAX_SECRET_ID_LENGTH) {
      throw new ToolError(TEXT.ERROR_SECRET_ID_TOO_LONG, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
    
    if (!CONFIG.SECRET_ID_REGEX.test(trimmed)) {
      throw new ToolError(TEXT.ERROR_INVALID_SECRET_ID_FORMAT, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
  }

  private validateAllowedActions(actions: readonly string[]): void {
    if (!Array.isArray(actions)) {
      throw new ToolError(TEXT.ERROR_INVALID_ALLOWED_ACTIONS, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
    
    if (actions.length === 0) {
      throw new ToolError(TEXT.ERROR_EMPTY_ALLOWED_ACTIONS, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
    
    for (const action of actions) {
      const trimmed = action?.trim();
      
      if (!trimmed) {
        throw new ToolError(TEXT.ERROR_INVALID_ACTION, CONFIG.ERROR_CODE_INVALID_POLICY);
      }
      
      if (!CONFIG.ACTION_REGEX.test(trimmed)) {
        throw new ToolError(TEXT.ERROR_INVALID_ACTION, CONFIG.ERROR_CODE_INVALID_POLICY);
      }
      
      const supportedActions = CONFIG.SUPPORTED_ACTIONS as readonly string[];
      if (!supportedActions.includes(trimmed)) {
        throw new ToolError(`${TEXT.ERROR_UNSUPPORTED_ACTION}: ${trimmed}`, CONFIG.ERROR_CODE_INVALID_POLICY);
      }
    }
  }

  private validateAllowedDomains(domains: readonly string[]): void {
    if (!Array.isArray(domains)) {
      throw new ToolError(TEXT.ERROR_INVALID_ALLOWED_DOMAINS, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
    
    if (domains.length === 0) {
      throw new ToolError(TEXT.ERROR_EMPTY_ALLOWED_DOMAINS, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
    
    for (const domain of domains) {
      const trimmed = domain?.trim();
      
      if (!trimmed) {
        throw new ToolError(TEXT.ERROR_INVALID_DOMAIN, CONFIG.ERROR_CODE_INVALID_POLICY);
      }
      
      if (trimmed.length > CONFIG.MAX_DOMAIN_LENGTH) {
        throw new ToolError(TEXT.ERROR_INVALID_DOMAIN, CONFIG.ERROR_CODE_INVALID_POLICY);
      }
      
      // Reject trailing dots and embedded whitespace in the trimmed value
      if (trimmed.endsWith('.') || /\s/.test(trimmed)) {
        throw new ToolError(`${TEXT.ERROR_INVALID_DOMAIN}: ${trimmed}`, CONFIG.ERROR_CODE_INVALID_POLICY);
      }
      
      if (!CONFIG.DOMAIN_REGEX.test(trimmed)) {
        throw new ToolError(`${TEXT.ERROR_INVALID_DOMAIN}: ${trimmed}`, CONFIG.ERROR_CODE_INVALID_POLICY);
      }
    }
  }

  private validateRateLimit(rateLimit: any): void {
    try {
      // Use Zod schema for rate limit validation
      RateLimitSchema.parse(rateLimit);
    } catch {
      throw new ToolError(TEXT.ERROR_INVALID_RATE_LIMIT, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
  }

  private validateExpiration(expiresAt: string): void {
    const trimmed = expiresAt?.trim();
    
    if (!trimmed) {
      throw new ToolError(TEXT.ERROR_INVALID_EXPIRATION, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
    
    const date = new Date(trimmed);
    
    if (isNaN(date.getTime())) {
      throw new ToolError(TEXT.ERROR_INVALID_EXPIRATION, CONFIG.ERROR_CODE_INVALID_POLICY);
    }
  }
}
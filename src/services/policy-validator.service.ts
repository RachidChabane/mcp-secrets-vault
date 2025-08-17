import { PolicyConfig, PolicyValidator } from '../interfaces/policy.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

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
      
      if (this.seenSecretIds.has(policy.secretId)) {
        throw new Error(TEXT.ERROR_DUPLICATE_POLICY);
      }
      
      this.seenSecretIds.add(policy.secretId);
    }
  }

  private validateStructure(policy: PolicyConfig): void {
    if (!policy || typeof policy !== 'object') {
      throw new Error(TEXT.ERROR_INVALID_POLICY_STRUCTURE);
    }
    
    const requiredFields: (keyof PolicyConfig)[] = [
      TEXT.FIELD_SECRET_ID as keyof PolicyConfig,
      TEXT.FIELD_ALLOWED_ACTIONS as keyof PolicyConfig,
      TEXT.FIELD_ALLOWED_DOMAINS as keyof PolicyConfig
    ];
    
    for (const field of requiredFields) {
      if (!(field in policy)) {
        throw new Error(`${TEXT.ERROR_MISSING_POLICY_FIELD}: ${field}`);
      }
    }
  }

  private validateSecretId(secretId: string): void {
    const trimmed = secretId?.trim();
    
    if (!trimmed) {
      throw new Error(TEXT.ERROR_SECRET_ID_TOO_SHORT);
    }
    
    if (trimmed.length > CONFIG.MAX_SECRET_ID_LENGTH) {
      throw new Error(TEXT.ERROR_SECRET_ID_TOO_LONG);
    }
    
    if (!CONFIG.SECRET_ID_REGEX.test(trimmed)) {
      throw new Error(TEXT.ERROR_INVALID_SECRET_ID_FORMAT);
    }
  }

  private validateAllowedActions(actions: readonly string[]): void {
    if (!Array.isArray(actions)) {
      throw new Error(TEXT.ERROR_INVALID_ALLOWED_ACTIONS);
    }
    
    if (actions.length === 0) {
      throw new Error(TEXT.ERROR_EMPTY_ALLOWED_ACTIONS);
    }
    
    for (const action of actions) {
      const trimmed = action?.trim();
      
      if (!trimmed) {
        throw new Error(TEXT.ERROR_INVALID_ACTION);
      }
      
      if (!CONFIG.ACTION_REGEX.test(trimmed)) {
        throw new Error(TEXT.ERROR_INVALID_ACTION);
      }
      
      const supportedActions = CONFIG.SUPPORTED_ACTIONS as readonly string[];
      if (!supportedActions.includes(trimmed)) {
        throw new Error(`${TEXT.ERROR_UNSUPPORTED_ACTION}: ${trimmed}`);
      }
    }
  }

  private validateAllowedDomains(domains: readonly string[]): void {
    if (!Array.isArray(domains)) {
      throw new Error(TEXT.ERROR_INVALID_ALLOWED_DOMAINS);
    }
    
    if (domains.length === 0) {
      throw new Error(TEXT.ERROR_EMPTY_ALLOWED_DOMAINS);
    }
    
    for (const domain of domains) {
      const trimmed = domain?.trim();
      
      if (!trimmed) {
        throw new Error(TEXT.ERROR_INVALID_DOMAIN);
      }
      
      if (trimmed.length > CONFIG.MAX_DOMAIN_LENGTH) {
        throw new Error(TEXT.ERROR_INVALID_DOMAIN);
      }
      
      // Reject trailing dots and embedded whitespace in the trimmed value
      if (trimmed.endsWith('.') || /\s/.test(trimmed)) {
        throw new Error(`${TEXT.ERROR_INVALID_DOMAIN}: ${trimmed}`);
      }
      
      if (!CONFIG.DOMAIN_REGEX.test(trimmed)) {
        throw new Error(`${TEXT.ERROR_INVALID_DOMAIN}: ${trimmed}`);
      }
    }
  }

  private validateRateLimit(rateLimit: any): void {
    if (!rateLimit || typeof rateLimit !== 'object') {
      throw new Error(TEXT.ERROR_INVALID_RATE_LIMIT);
    }
    
    const { requests, windowSeconds } = rateLimit;
    
    if (typeof requests !== 'number' || requests <= 0) {
      throw new Error(TEXT.ERROR_INVALID_RATE_LIMIT);
    }
    
    if (typeof windowSeconds !== 'number' || windowSeconds <= 0) {
      throw new Error(TEXT.ERROR_INVALID_RATE_LIMIT);
    }
  }

  private validateExpiration(expiresAt: string): void {
    const trimmed = expiresAt?.trim();
    
    if (!trimmed) {
      throw new Error(TEXT.ERROR_INVALID_EXPIRATION);
    }
    
    const date = new Date(trimmed);
    
    if (isNaN(date.getTime())) {
      throw new Error(TEXT.ERROR_INVALID_EXPIRATION);
    }
  }
}
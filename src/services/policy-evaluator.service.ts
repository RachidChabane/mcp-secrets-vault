import { PolicyConfig, PolicyEvaluator, PolicyEvaluationResult } from '../interfaces/policy.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

export class PolicyEvaluatorService implements PolicyEvaluator {
  private readonly policies = new Map<string, PolicyConfig>();

  constructor(policies: PolicyConfig[] = []) {
    for (const policy of policies) {
      const trimmedKey = policy.secretId?.trim();
      if (trimmedKey) {
        this.policies.set(trimmedKey, policy);
      }
    }
  }

  evaluate(secretId: string, action: string, domain: string): PolicyEvaluationResult {
    const trimmedSecretId = secretId?.trim();
    const trimmedDomain = domain?.trim()?.toLowerCase();
    
    // Normalize action to canonical form (lowercase, trimmed)
    const normalizedAction = action?.trim()?.toLowerCase();
    
    if (!trimmedSecretId || !normalizedAction || !trimmedDomain) {
      return {
        allowed: false,
        code: CONFIG.ERROR_CODE_INVALID_REQUEST,
        message: TEXT.ERROR_INVALID_REQUEST
      };
    }
    
    // Validate action is in supported actions
    const supportedActions = CONFIG.SUPPORTED_ACTIONS as readonly string[];
    if (!supportedActions.includes(normalizedAction)) {
      return {
        allowed: false,
        code: CONFIG.ERROR_CODE_FORBIDDEN_ACTION,
        message: TEXT.ERROR_UNSUPPORTED_ACTION
      };
    }
    
    const policy = this.policies.get(trimmedSecretId);
    
    if (!policy) {
      return {
        allowed: false,
        code: CONFIG.ERROR_CODE_NO_POLICY,
        message: TEXT.ERROR_POLICY_NOT_FOUND
      };
    }
    
    if (policy.expiresAt) {
      const expirationDate = new Date(policy.expiresAt);
      const now = new Date();
      // Treat expiresAt === now as expired
      if (expirationDate <= now) {
        return {
          allowed: false,
          code: CONFIG.ERROR_CODE_POLICY_EXPIRED,
          message: TEXT.ERROR_POLICY_EXPIRED
        };
      }
    }
    
    if (!policy.allowedActions.includes(normalizedAction)) {
      return {
        allowed: false,
        code: CONFIG.ERROR_CODE_FORBIDDEN_ACTION,
        message: TEXT.ERROR_FORBIDDEN_ACTION
      };
    }
    
    const domainAllowed = policy.allowedDomains.some(
      allowedDomain => allowedDomain.toLowerCase() === trimmedDomain
    );
    
    if (!domainAllowed) {
      return {
        allowed: false,
        code: CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN,
        message: TEXT.ERROR_FORBIDDEN_DOMAIN
      };
    }
    
    return { allowed: true };
  }

  getPolicy(secretId: string): PolicyConfig | undefined {
    const trimmed = secretId?.trim();
    return trimmed ? this.policies.get(trimmed) : undefined;
  }

  hasPolicy(secretId: string): boolean {
    const trimmed = secretId?.trim();
    return trimmed ? this.policies.has(trimmed) : false;
  }
}
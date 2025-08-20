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

  private validateInput(secretId: string, action: string, domain: string) {
    const trimmedSecretId = secretId?.trim();
    const trimmedDomain = domain?.trim()?.toLowerCase();
    const normalizedAction = action?.trim()?.toLowerCase();
    
    if (!trimmedSecretId || !normalizedAction || !trimmedDomain) {
      return { valid: false, error: {
        allowed: false,
        code: CONFIG.ERROR_CODE_INVALID_REQUEST,
        message: TEXT.ERROR_INVALID_REQUEST
      }};
    }
    return { valid: true, trimmedSecretId, normalizedAction, trimmedDomain };
  }

  private validateAction(action: string): PolicyEvaluationResult | null {
    const supportedActions = CONFIG.SUPPORTED_ACTIONS as readonly string[];
    if (!supportedActions.includes(action)) {
      return {
        allowed: false,
        code: CONFIG.ERROR_CODE_FORBIDDEN_ACTION,
        message: TEXT.ERROR_UNSUPPORTED_ACTION
      };
    }
    return null;
  }

  private validateExpiration(policy: PolicyConfig): PolicyEvaluationResult | null {
    if (policy.expiresAt) {
      const expirationDate = new Date(policy.expiresAt);
      if (expirationDate <= new Date()) {
        return {
          allowed: false,
          code: CONFIG.ERROR_CODE_POLICY_EXPIRED,
          message: TEXT.ERROR_POLICY_EXPIRED
        };
      }
    }
    return null;
  }

  private validatePolicyPermissions(policy: PolicyConfig, action: string, domain: string): PolicyEvaluationResult {
    if (!policy.allowedActions.includes(action)) {
      return {
        allowed: false,
        code: CONFIG.ERROR_CODE_FORBIDDEN_ACTION,
        message: TEXT.ERROR_FORBIDDEN_ACTION
      };
    }
    
    const domainAllowed = policy.allowedDomains.some(
      allowedDomain => allowedDomain.toLowerCase() === domain
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

  evaluate(secretId: string, action: string, domain: string): PolicyEvaluationResult {
    const validation = this.validateInput(secretId, action, domain);
    if (!validation.valid) return validation.error!;
    
    const actionError = this.validateAction(validation.normalizedAction!);
    if (actionError) return actionError;
    
    const policy = this.policies.get(validation.trimmedSecretId!);
    if (!policy) {
      return {
        allowed: false,
        code: CONFIG.ERROR_CODE_NO_POLICY,
        message: TEXT.ERROR_POLICY_NOT_FOUND
      };
    }
    
    const expirationError = this.validateExpiration(policy);
    if (expirationError) return expirationError;
    
    return this.validatePolicyPermissions(policy, validation.normalizedAction!, validation.trimmedDomain!);
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
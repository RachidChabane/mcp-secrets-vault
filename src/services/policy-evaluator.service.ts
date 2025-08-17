import { PolicyConfig, PolicyEvaluator, PolicyEvaluationResult } from '../interfaces/policy.interface.js';
import { TEXT } from '../constants/text-constants.js';

export class PolicyEvaluatorService implements PolicyEvaluator {
  private readonly policies = new Map<string, PolicyConfig>();

  constructor(policies: PolicyConfig[] = []) {
    for (const policy of policies) {
      this.policies.set(policy.secretId, policy);
    }
  }

  evaluate(secretId: string, action: string, domain: string): PolicyEvaluationResult {
    const trimmedSecretId = secretId?.trim();
    const trimmedAction = action?.trim();
    const trimmedDomain = domain?.trim()?.toLowerCase();
    
    if (!trimmedSecretId) {
      return {
        allowed: false,
        reason: TEXT.ERROR_INVALID_SECRET_ID_FORMAT
      };
    }
    
    const policy = this.policies.get(trimmedSecretId);
    
    if (!policy) {
      return {
        allowed: false,
        reason: TEXT.ERROR_POLICY_NOT_FOUND
      };
    }
    
    if (policy.expiresAt) {
      const expirationDate = new Date(policy.expiresAt);
      if (expirationDate < new Date()) {
        return {
          allowed: false,
          reason: TEXT.ERROR_POLICY_EXPIRED
        };
      }
    }
    
    if (!policy.allowedActions.includes(trimmedAction)) {
      return {
        allowed: false,
        reason: TEXT.ERROR_FORBIDDEN_ACTION
      };
    }
    
    const domainAllowed = policy.allowedDomains.some(
      allowedDomain => allowedDomain.toLowerCase() === trimmedDomain
    );
    
    if (!domainAllowed) {
      return {
        allowed: false,
        reason: TEXT.ERROR_FORBIDDEN_DOMAIN
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
import { promises as fs } from 'fs';
import { PolicyConfig, PolicyLoader } from '../interfaces/policy.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

export class PolicyLoaderService implements PolicyLoader {
  constructor(private readonly policiesPath: string = CONFIG.DEFAULT_POLICIES_FILE) {}

  async loadPolicies(): Promise<PolicyConfig[]> {
    try {
      const content = await fs.readFile(this.policiesPath, 'utf-8');
      const data: unknown = JSON.parse(content);
      
      if (!Array.isArray(data)) {
        throw new Error(TEXT.ERROR_INVALID_CONFIG);
      }
      
      // Type assertion only after array check
      return (data as unknown[]).map(policy => this.freezePolicy(policy as any));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      
      if (error instanceof SyntaxError) {
        throw new Error(TEXT.ERROR_INVALID_CONFIG);
      }
      
      throw error;
    }
  }

  private freezePolicy(policy: any): PolicyConfig {
    // Normalize actions to lowercase canonical form
    const frozen: PolicyConfig = {
      secretId: policy.secretId?.trim(),
      allowedActions: Array.isArray(policy.allowedActions) 
        ? policy.allowedActions.map((a: any) => a?.trim()?.toLowerCase())
        : [],
      allowedDomains: Array.isArray(policy.allowedDomains)
        ? policy.allowedDomains.map((d: any) => d?.trim())
        : [],
    };
    
    if (policy.rateLimit) {
      frozen.rateLimit = Object.freeze({
        requests: policy.rateLimit.requests,
        windowSeconds: policy.rateLimit.windowSeconds
      });
    }
    
    if (policy.expiresAt) {
      frozen.expiresAt = policy.expiresAt?.trim();
    }
    
    return Object.freeze(frozen);
  }
}
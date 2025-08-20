import { promises as fs } from 'fs';
import path from 'path';
import { PolicyConfig, PolicyLoader } from '../interfaces/policy.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

export class PolicyLoaderService implements PolicyLoader {
  constructor(
    private readonly policiesPath: string = path.join(
      CONFIG.DEFAULT_POLICIES_DIR,
      CONFIG.DEFAULT_POLICIES_FILE
    )
  ) {}

  async loadPolicies(): Promise<PolicyConfig[]> {
    try {
      const content = await fs.readFile(this.policiesPath, CONFIG.DEFAULT_ENCODING);
      const data: unknown = JSON.parse(content);
      
      if (!Array.isArray(data)) {
        throw new Error(TEXT.ERROR_INVALID_CONFIG);
      }
      
      // Type assertion only after array check
      return (data as unknown[]).map(policy => this.freezePolicy(policy as any));
    } catch (error: any) {
      if (error.code === CONFIG.FS_ERROR_ENOENT) {
        return [];
      }
      
      if (error instanceof SyntaxError) {
        throw new Error(TEXT.ERROR_INVALID_CONFIG);
      }
      
      throw error;
    }
  }

  private normalizeList(items: any[]): readonly string[] {
    if (!Array.isArray(items)) return Object.freeze([]);
    const normalized = new Set<string>();
    for (const item of items) {
      const trimmed = item?.toString()?.trim()?.toLowerCase();
      if (trimmed) normalized.add(trimmed);
    }
    return Object.freeze(Array.from(normalized).sort());
  }

  private freezePolicy(policy: any): PolicyConfig {
    const frozen: any = {
      secretId: policy.secretId?.trim(),
      allowedActions: this.normalizeList(policy.allowedActions),
      allowedDomains: this.normalizeList(policy.allowedDomains),
    };
    
    if (policy.rateLimit) {
      frozen.rateLimit = Object.freeze({
        requests: policy.rateLimit.requests,
        windowSeconds: policy.rateLimit.windowSeconds
      });
    }
    if (policy.expiresAt) frozen.expiresAt = policy.expiresAt?.trim();
    return Object.freeze(frozen) as PolicyConfig;
  }
}
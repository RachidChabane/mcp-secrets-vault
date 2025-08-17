export interface RateLimit {
  requests: number;
  windowSeconds: number;
}

export interface PolicyConfig {
  secretId: string;
  allowedActions: string[];
  allowedDomains: string[];
  rateLimit?: RateLimit;
  expiresAt?: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

export interface PolicyLoader {
  loadPolicies(): Promise<PolicyConfig[]>;
}

export interface PolicyValidator {
  validate(policy: PolicyConfig): void;
  validateAll(policies: PolicyConfig[]): void;
}

export interface PolicyEvaluator {
  evaluate(secretId: string, action: string, domain: string): PolicyEvaluationResult;
  getPolicy(secretId: string): PolicyConfig | undefined;
  hasPolicy(secretId: string): boolean;
}

export interface PolicyProvider {
  loadPolicies(): Promise<void>;
  evaluate(secretId: string, action: string, domain: string): PolicyEvaluationResult;
  getPolicy(secretId: string): PolicyConfig | undefined;
  hasPolicy(secretId: string): boolean;
}
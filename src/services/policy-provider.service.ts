import { 
  PolicyConfig, 
  PolicyProvider, 
  PolicyLoader, 
  PolicyValidator, 
  PolicyEvaluator, 
  PolicyEvaluationResult 
} from '../interfaces/policy.interface.js';
import { PolicyLoaderService } from './policy-loader.service.js';
import { PolicyValidatorService } from './policy-validator.service.js';
import { PolicyEvaluatorService } from './policy-evaluator.service.js';

export class PolicyProviderService implements PolicyProvider {
  private loader: PolicyLoader;
  private validator: PolicyValidator;
  private evaluator: PolicyEvaluator | null = null;

  constructor(
    policiesPath?: string,
    loader?: PolicyLoader,
    validator?: PolicyValidator
  ) {
    this.loader = loader || new PolicyLoaderService(policiesPath);
    this.validator = validator || new PolicyValidatorService();
  }

  async loadPolicies(): Promise<void> {
    const policies = await this.loader.loadPolicies();
    this.validator.validateAll(policies);
    this.evaluator = new PolicyEvaluatorService(policies);
  }

  evaluate(secretId: string, action: string, domain: string): PolicyEvaluationResult {
    if (!this.evaluator) {
      return {
        allowed: false,
        reason: 'Policies not loaded'
      };
    }
    
    return this.evaluator.evaluate(secretId, action, domain);
  }

  getPolicy(secretId: string): PolicyConfig | undefined {
    if (!this.evaluator) {
      return undefined;
    }
    
    return this.evaluator.getPolicy(secretId);
  }

  hasPolicy(secretId: string): boolean {
    if (!this.evaluator) {
      return false;
    }
    
    return this.evaluator.hasPolicy(secretId);
  }
}
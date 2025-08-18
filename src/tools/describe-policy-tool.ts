import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PolicyProvider, PolicyConfig } from '../interfaces/policy.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { z, ZodError } from 'zod';
import { VaultError, ValidationError } from '../utils/errors.js';

const DescribePolicySchema = z.object({
  [TEXT.FIELD_SECRET_ID]: z.string()
    .trim()
    .min(CONFIG.MIN_SECRET_ID_LENGTH)
    .max(CONFIG.MAX_SECRET_ID_LENGTH)
    .regex(CONFIG.SECRET_ID_REGEX)
});

export interface DescribePolicyResponse {
  readonly [key: string]: unknown;
}

export class DescribePolicyTool {
  private readonly tool: Tool;

  constructor(private readonly policyProvider: PolicyProvider) {
    this.tool = {
      name: TEXT.TOOL_DESCRIBE,
      description: TEXT.TOOL_DESC_DESCRIBE,
      inputSchema: {
        [TEXT.SCHEMA_TYPE]: TEXT.SCHEMA_TYPE_OBJECT,
        [TEXT.SCHEMA_PROPERTIES]: {
          [TEXT.FIELD_SECRET_ID]: {
            [TEXT.SCHEMA_TYPE]: TEXT.SCHEMA_TYPE_STRING,
            [TEXT.FIELD_DESCRIPTION]: TEXT.INPUT_DESC_SECRET_ID
          }
        },
        [TEXT.SCHEMA_REQUIRED]: [TEXT.FIELD_SECRET_ID]
      }
    };
  }

  getTool(): Tool {
    return this.tool;
  }

  async execute(args: unknown): Promise<DescribePolicyResponse> {
    const secretId = this.validateInput(args);
    const policy = this.fetchPolicy(secretId);
    return this.buildResponse(policy);
  }

  private validateInput(args: unknown): string {
    try {
      const parsed = DescribePolicySchema.parse(args);
      return parsed[TEXT.FIELD_SECRET_ID];
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        if (firstIssue && firstIssue.path.length > 0) {
          const field = String(firstIssue.path[0]);
          throw new ValidationError(
            CONFIG.ERROR_CODE_INVALID_REQUEST,
            TEXT.ERROR_INVALID_REQUEST,
            field
          );
        }
        throw new ValidationError(
          CONFIG.ERROR_CODE_INVALID_REQUEST,
          TEXT.ERROR_INVALID_REQUEST,
          TEXT.FIELD_SECRET_ID
        );
      }
      throw error;
    }
  }

  private fetchPolicy(secretId: string): PolicyConfig {
    const policy = this.policyProvider.getPolicy(secretId);
    
    if (!policy) {
      throw new VaultError(
        CONFIG.ERROR_CODE_NO_POLICY,
        TEXT.ERROR_POLICY_NOT_FOUND,
        { [TEXT.FIELD_SECRET_ID]: secretId }
      );
    }
    
    return policy;
  }

  private buildResponse(policy: PolicyConfig): DescribePolicyResponse {
    const response: Record<string, unknown> = {
      [TEXT.FIELD_SECRET_ID]: policy.secretId,
      [TEXT.FIELD_ALLOWED_ACTIONS]: Object.freeze([...policy.allowedActions]),
      [TEXT.FIELD_ALLOWED_DOMAINS]: Object.freeze([...policy.allowedDomains])
    };
    
    if (policy.rateLimit) {
      response[TEXT.FIELD_RATE_LIMIT] = Object.freeze({
        [TEXT.FIELD_REQUESTS]: policy.rateLimit.requests,
        [TEXT.FIELD_WINDOW_SECONDS]: policy.rateLimit.windowSeconds
      });
    }
    
    if (policy.expiresAt) {
      response[TEXT.FIELD_EXPIRES_AT] = policy.expiresAt;
    }
    
    return Object.freeze(response);
  }
}
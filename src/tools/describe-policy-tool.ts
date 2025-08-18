import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PolicyProvider, PolicyConfig } from '../interfaces/policy.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { z } from 'zod';
import { ToolError } from '../utils/errors.js';
import { mapZodErrorToToolError } from '../utils/zod-mapper.js';

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
      // Check if it's a ZodError by looking for the issues property
      const err = error as any;
      if (err?.issues && Array.isArray(err.issues)) {
        // Map ZodError to ToolError with proper code
        throw mapZodErrorToToolError(err as z.ZodError);
      }
      throw error;
    }
  }

  private fetchPolicy(secretId: string): PolicyConfig {
    const policy = this.policyProvider.getPolicy(secretId);
    
    if (!policy) {
      // Normalize to ToolError at boundary
      throw new ToolError(
        TEXT.ERROR_POLICY_NOT_FOUND,
        CONFIG.ERROR_CODE_NO_POLICY
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
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PolicyProvider } from '../interfaces/policy.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { z } from 'zod';
import { VaultError } from '../utils/errors.js';

const DescribePolicySchema = z.object({
  secretId: z.string()
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
        type: 'object',
        properties: {
          secretId: {
            type: 'string',
            description: 'The ID of the secret to describe policy for'
          }
        },
        required: ['secretId']
      }
    };
  }

  getTool(): Tool {
    return this.tool;
  }

  async execute(args: unknown): Promise<DescribePolicyResponse> {
    const parsed = DescribePolicySchema.parse(args);
    const { secretId } = parsed;
    
    const policy = this.policyProvider.getPolicy(secretId);
    
    if (!policy) {
      throw new VaultError(
        CONFIG.ERROR_CODE_NO_POLICY,
        TEXT.ERROR_POLICY_NOT_FOUND,
        { [TEXT.FIELD_SECRET_ID]: secretId }
      );
    }
    
    // Build response object without exposing envVar
    const response: Record<string, unknown> = {
      [TEXT.FIELD_SECRET_ID]: policy.secretId,
      [TEXT.FIELD_ALLOWED_ACTIONS]: Object.freeze([...policy.allowedActions]),
      [TEXT.FIELD_ALLOWED_DOMAINS]: Object.freeze([...policy.allowedDomains])
    };
    
    // Include optional fields if present
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
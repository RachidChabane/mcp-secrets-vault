import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SecretProvider } from '../interfaces/secret-provider.interface.js';
import type { IActionExecutor } from '../interfaces/action-executor.interface.js';
import { SecretAccessor } from '../interfaces/secret-accessor.interface.js';
import { JsonlAuditService } from '../services/audit-service.js';
import { PolicyProviderService } from '../services/policy-provider.service.js';
import type { AuditService } from '../interfaces/audit.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from '../utils/errors.js';
import { z } from 'zod';

const UseSecretSchema = z.object({
  secretId: z.string().min(1),
  action: z.object({
    type: z.enum(['http_get', 'http_post']),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    body: z.string().optional()
  })
});

export interface UseSecretArgs {
  readonly secretId: string;
  readonly action: {
    readonly type: 'http_get' | 'http_post';
    readonly url: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  };
}

export interface UseSecretResponse {
  readonly success: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

export class UseSecretTool {
  private readonly tool: Tool;
  private readonly auditService: AuditService;

  constructor(
    private readonly secretProvider: SecretProvider & SecretAccessor,
    private readonly policyProvider: PolicyProviderService,
    private readonly actionExecutor: IActionExecutor
  ) {
    this.auditService = new JsonlAuditService();
    
    this.tool = {
      name: TEXT.TOOL_USE,
      description: TEXT.TOOL_DESC_USE,
      inputSchema: {
        type: TEXT.SCHEMA_TYPE_OBJECT,
        properties: {
          secretId: {
            type: TEXT.SCHEMA_TYPE_STRING,
            description: 'The ID of the secret to use'
          },
          action: {
            type: TEXT.SCHEMA_TYPE_OBJECT,
            properties: {
              type: {
                type: TEXT.SCHEMA_TYPE_STRING,
                enum: [TEXT.HTTP_METHOD_GET, TEXT.HTTP_METHOD_POST],
                description: 'The type of action to perform'
              },
              url: {
                type: TEXT.SCHEMA_TYPE_STRING,
                description: 'The URL to make the request to'
              },
              headers: {
                type: TEXT.SCHEMA_TYPE_OBJECT,
                description: 'Optional headers for the request',
                additionalProperties: { type: TEXT.SCHEMA_TYPE_STRING }
              },
              body: {
                type: TEXT.SCHEMA_TYPE_STRING,
                description: 'Optional body for POST requests'
              }
            },
            required: ['type', 'url']
          }
        },
        required: ['secretId', 'action']
      }
    };
  }

  getTool(): Tool {
    return this.tool;
  }

  async requestSecretAccess(
    secretId: string,
    action: string,
    domain: string
  ): Promise<{ allowed: boolean; message?: string }> {
    try {
      const decision = this.policyProvider.evaluate(
        secretId,
        action,
        domain
      );
      
      await this.auditService.write({
        secretId,
        action,
        domain,
        timestamp: new Date().toISOString(),
        outcome: decision.allowed ? 'success' as const : 'denied' as const,
        reason: decision.message || ''
      });
      
      return decision;
    } catch (error) {
      await this.auditService.write({
        secretId,
        action,
        domain,
        timestamp: new Date().toISOString(),
        outcome: 'error' as const,
        reason: error instanceof Error ? error.message : TEXT.ERROR_TOOL_EXECUTION_FAILED
      });
      throw error;
    }
  }

  async execute(args: unknown): Promise<UseSecretResponse> {
    try {
      const validatedArgs = UseSecretSchema.parse(args) as UseSecretArgs;
      const { secretId, action } = validatedArgs;
      
      // Extract domain from URL
      const url = new URL(action.url);
      const domain = url.hostname;
      
      // Check if secret exists
      const secretInfo = this.secretProvider.getSecretInfo(secretId);
      if (!secretInfo) {
        throw new ToolError(
          TEXT.ERROR_UNKNOWN_SECRET,
          CONFIG.ERROR_CODE_UNKNOWN_SECRET
        );
      }
      
      if (!secretInfo.available) {
        throw new ToolError(
          TEXT.ERROR_UNKNOWN_SECRET,
          CONFIG.ERROR_CODE_UNKNOWN_SECRET
        );
      }
      
      // Check policy
      const accessDecision = await this.requestSecretAccess(
        secretId,
        action.type,
        domain
      );
      
      if (!accessDecision.allowed) {
        throw new ToolError(
          accessDecision.message || TEXT.ERROR_FORBIDDEN_ACTION,
          CONFIG.ERROR_CODE_FORBIDDEN_ACTION
        );
      }
      
      // Get secret value
      const secretValue = this.secretProvider.getSecretValue(secretId);
      if (!secretValue) {
        throw new ToolError(
          TEXT.ERROR_UNKNOWN_SECRET,
          CONFIG.ERROR_CODE_UNKNOWN_SECRET
        );
      }
      
      // Execute action with secret
      const result = await this.actionExecutor.execute({
        method: action.type === 'http_get' ? 'GET' : 'POST',
        url: action.url,
        headers: action.headers,
        body: action.body,
        secretValue,
        injectionType: 'bearer'
      });
      
      return {
        success: true,
        result
      };
    } catch (error) {
      if (error instanceof ToolError) {
        return {
          success: false,
          error: error.message
        };
      }
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: TEXT.ERROR_INVALID_REQUEST
        };
      }
      
      return {
        success: false,
        error: TEXT.ERROR_TOOL_EXECUTION_FAILED
      };
    }
  }
}
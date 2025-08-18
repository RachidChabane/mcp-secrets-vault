import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SecretProvider } from '../interfaces/secret-provider.interface.js';
import type { IActionExecutor } from '../interfaces/action-executor.interface.js';
import { SecretAccessor } from '../interfaces/secret-accessor.interface.js';
import { JsonlAuditService } from '../services/audit-service.js';
import { PolicyProviderService } from '../services/policy-provider.service.js';
import { RateLimiterService } from '../services/rate-limiter.service.js';
import type { AuditService } from '../interfaces/audit.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from '../utils/errors.js';
import { writeError } from '../utils/logging.js';
import { z } from 'zod';

const UseSecretSchema = z.object({
  secretId: z.string().min(1).transform(s => s.trim()),
  action: z.object({
    type: z.enum([TEXT.HTTP_METHOD_GET, TEXT.HTTP_METHOD_POST]),
    url: z.string().transform(s => s.trim()).refine(
      (val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: TEXT.ERROR_INVALID_URL }
    ),
    headers: z.record(z.string()).optional().transform(h => {
      if (!h) return undefined;
      const trimmed: Record<string, string> = {};
      for (const [key, value] of Object.entries(h)) {
        const trimmedKey = key.trim();
        if (trimmedKey === '') {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              message: TEXT.ERROR_EMPTY_HEADER_NAME,
              path: ['headers', key]
            }
          ]);
        }
        trimmed[trimmedKey] = value.trim();
      }
      return trimmed;
    }),
    body: z.string().optional().transform(s => s?.trim()),
    injectionType: z.enum([TEXT.INJECTION_TYPE_BEARER, TEXT.INJECTION_TYPE_HEADER])
      .default(TEXT.INJECTION_TYPE_BEARER)
  })
});

export interface UseSecretArgs {
  readonly secretId: string;
  readonly action: {
    readonly type: typeof TEXT.HTTP_METHOD_GET | typeof TEXT.HTTP_METHOD_POST;
    readonly url: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
    readonly injectionType?: typeof TEXT.INJECTION_TYPE_BEARER | typeof TEXT.INJECTION_TYPE_HEADER;
  };
}

export interface UseSecretResponse {
  readonly success: boolean;
  readonly result?: unknown;
  readonly error?: string;
  readonly code?: string;
}

export class UseSecretTool {
  private readonly tool: Tool;
  private readonly auditService: AuditService;
  private readonly rateLimiter: RateLimiterService;

  constructor(
    private readonly secretProvider: SecretProvider & SecretAccessor,
    private readonly policyProvider: PolicyProviderService,
    private readonly actionExecutor: IActionExecutor,
    rateLimiter?: RateLimiterService
  ) {
    this.auditService = new JsonlAuditService();
    this.rateLimiter = rateLimiter || new RateLimiterService();
    
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
              },
              injectionType: {
                type: TEXT.SCHEMA_TYPE_STRING,
                enum: [TEXT.INJECTION_TYPE_BEARER, TEXT.INJECTION_TYPE_HEADER],
                description: 'How to inject the secret (bearer or header)'
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


  async execute(args: unknown): Promise<UseSecretResponse> {
    let secretId: string | undefined;
    let action: any;
    let domain: string | undefined;
    
    try {
      // Validate and trim inputs
      let validatedArgs: UseSecretArgs;
      try {
        validatedArgs = UseSecretSchema.parse(args) as UseSecretArgs;
        secretId = validatedArgs.secretId;
        action = validatedArgs.action;
      } catch (validationError) {
        // Audit invalid request even when missing fields
        const rawArgs = args as any;
        await this.auditService.write({
          secretId: rawArgs?.secretId || 'unknown',
          action: rawArgs?.action?.type || 'unknown',
          domain: 'unknown',
          timestamp: new Date().toISOString(),
          outcome: 'denied' as const,
          reason: TEXT.ERROR_INVALID_REQUEST
        });
        throw validationError;
      }
      
      // Extract and validate domain
      let url: URL;
      try {
        url = new URL(action.url);
        domain = url.hostname;
      } catch {
        await this.auditService.write({
          secretId: secretId || 'unknown',
          action: action?.type || 'unknown',
          domain: 'invalid',
          timestamp: new Date().toISOString(),
          outcome: 'denied' as const,
          reason: TEXT.ERROR_INVALID_URL
        });
        throw new ToolError(
          TEXT.ERROR_INVALID_URL,
          CONFIG.ERROR_CODE_INVALID_URL
        );
      }
      
      // Check rate limit first
      const rateLimitKey = `${secretId}:${domain}`;
      const rateCheck = this.rateLimiter.checkLimit(rateLimitKey);
      
      if (!rateCheck.allowed) {
        await this.auditService.write({
          secretId,
          action: action.type,
          domain,
          timestamp: new Date().toISOString(),
          outcome: 'denied' as const,
          reason: TEXT.ERROR_RATE_LIMITED
        });
        
        writeError(TEXT.ERROR_RATE_LIMITED, {
          level: 'WARN',
          code: CONFIG.ERROR_CODE_RATE_LIMITED,
          secretId,
          domain
        });
        
        throw new ToolError(
          TEXT.ERROR_RATE_LIMITED,
          CONFIG.ERROR_CODE_RATE_LIMITED
        );
      }
      
      // Check if secret exists
      const secretInfo = this.secretProvider.getSecretInfo(secretId);
      if (!secretInfo || !secretInfo.available) {
        await this.auditService.write({
          secretId,
          action: action.type,
          domain,
          timestamp: new Date().toISOString(),
          outcome: 'denied' as const,
          reason: TEXT.ERROR_UNKNOWN_SECRET
        });
        
        throw new ToolError(
          TEXT.ERROR_UNKNOWN_SECRET,
          CONFIG.ERROR_CODE_UNKNOWN_SECRET
        );
      }
      
      // Check policy
      let accessDecision;
      try {
        accessDecision = this.policyProvider.evaluate(
          secretId,
          action.type,
          domain
        );
      } catch (policyError) {
        // Audit policy evaluation error
        await this.auditService.write({
          secretId,
          action: action.type,
          domain,
          timestamp: new Date().toISOString(),
          outcome: 'error' as const,
          reason: policyError instanceof Error 
            ? policyError.message 
            : TEXT.ERROR_EXECUTION_FAILED
        });
        
        throw new ToolError(
          TEXT.ERROR_EXECUTION_FAILED,
          CONFIG.ERROR_CODE_EXECUTION_FAILED
        );
      }
      
      if (!accessDecision.allowed) {
        await this.auditService.write({
          secretId,
          action: action.type,
          domain,
          timestamp: new Date().toISOString(),
          outcome: 'denied' as const,
          reason: accessDecision.message || TEXT.ERROR_FORBIDDEN_ACTION
        });
        
        const errorCode = accessDecision.code || CONFIG.ERROR_CODE_FORBIDDEN_ACTION;
        const errorMessage = accessDecision.message || TEXT.ERROR_FORBIDDEN_ACTION;
        
        throw new ToolError(errorMessage, errorCode);
      }
      
      // Get secret value
      const secretValue = this.secretProvider.getSecretValue(secretId);
      if (!secretValue) {
        await this.auditService.write({
          secretId,
          action: action.type,
          domain,
          timestamp: new Date().toISOString(),
          outcome: 'error' as const,
          reason: TEXT.ERROR_MISSING_ENV
        });
        
        throw new ToolError(
          TEXT.ERROR_MISSING_ENV,
          CONFIG.ERROR_CODE_MISSING_ENV
        );
      }
      
      // Execute action with secret
      let result;
      try {
        result = await this.actionExecutor.execute({
          method: action.type === TEXT.HTTP_METHOD_GET ? TEXT.HTTP_VERB_GET : TEXT.HTTP_VERB_POST,
          url: action.url,
          headers: action.headers,
          body: action.body,
          secretValue,
          injectionType: action.injectionType || TEXT.INJECTION_TYPE_BEARER
        });
        
        // Audit success
        await this.auditService.write({
          secretId,
          action: action.type,
          domain,
          timestamp: new Date().toISOString(),
          outcome: 'success' as const,
          reason: TEXT.SUCCESS_REQUEST_COMPLETED
        });
      } catch (executorError) {
        // Audit executor error
        await this.auditService.write({
          secretId,
          action: action.type,
          domain,
          timestamp: new Date().toISOString(),
          outcome: 'error' as const,
          reason: executorError instanceof Error 
            ? executorError.message 
            : TEXT.ERROR_NETWORK_ERROR
        });
        
        throw executorError;
      }
      
      return {
        success: true,
        result
      };
    } catch (error) {
      // Log structured error
      if (error instanceof ToolError) {
        writeError(error.message, {
          level: 'ERROR',
          code: error.code,
          secretId,
          domain
        });
        
        return {
          success: false,
          error: error.message,
          code: error.code
        };
      }
      
      if (error instanceof z.ZodError) {
        // Check for specific error types
        const hasEmptyHeader = error.errors.some(e => 
          e.message === TEXT.ERROR_EMPTY_HEADER_NAME
        );
        
        const errorMessage = hasEmptyHeader 
          ? TEXT.ERROR_EMPTY_HEADER_NAME 
          : TEXT.ERROR_INVALID_REQUEST;
        const errorCode = hasEmptyHeader 
          ? CONFIG.ERROR_CODE_INVALID_HEADERS 
          : CONFIG.ERROR_CODE_INVALID_REQUEST;
        
        writeError(errorMessage, {
          level: 'ERROR',
          code: errorCode,
          details: error.errors
        });
        
        return {
          success: false,
          error: errorMessage,
          code: errorCode
        };
      }
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : TEXT.ERROR_EXECUTION_FAILED;
        
      writeError(errorMessage, {
        level: 'ERROR',
        code: CONFIG.ERROR_CODE_EXECUTION_FAILED
      });
      
      return {
        success: false,
        error: errorMessage,
        code: CONFIG.ERROR_CODE_EXECUTION_FAILED
      };
    }
  }
}
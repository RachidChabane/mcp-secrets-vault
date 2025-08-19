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
import { mapZodErrorToToolError } from '../utils/zod-mapper.js';
import { respondByCode, HTTP_METHOD_MAP, INJECTION_HANDLERS, RESPONSE_BY_CODE } from '../utils/tables.js';

const UseSecretSchema = z.object({
  secretId: z.string().min(1).transform(s => s.trim()),
  action: z.object({
    type: z.string().transform(s => s.trim()).pipe(z.enum([TEXT.HTTP_METHOD_GET, TEXT.HTTP_METHOD_POST])),
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
    injectionType: z.string().optional().transform(s => s?.trim()).pipe(z.enum([TEXT.INJECTION_TYPE_BEARER, TEXT.INJECTION_TYPE_HEADER]))
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

interface AuditContext {
  secretId: string;
  action: string;
  domain: string;
}

interface ValidatedRequest {
  secretId: string;
  action: UseSecretArgs['action'];
  domain: string;
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
            description: TEXT.INPUT_DESC_USE_SECRET_ID
          },
          action: {
            type: TEXT.SCHEMA_TYPE_OBJECT,
            properties: {
              type: {
                type: TEXT.SCHEMA_TYPE_STRING,
                enum: [TEXT.HTTP_METHOD_GET, TEXT.HTTP_METHOD_POST],
                description: TEXT.INPUT_DESC_ACTION_TYPE
              },
              url: {
                type: TEXT.SCHEMA_TYPE_STRING,
                description: TEXT.INPUT_DESC_ACTION_URL
              },
              headers: {
                type: TEXT.SCHEMA_TYPE_OBJECT,
                description: TEXT.INPUT_DESC_ACTION_HEADERS,
                additionalProperties: { type: TEXT.SCHEMA_TYPE_STRING }
              },
              body: {
                type: TEXT.SCHEMA_TYPE_STRING,
                description: TEXT.INPUT_DESC_ACTION_BODY
              },
              injectionType: {
                type: TEXT.SCHEMA_TYPE_STRING,
                enum: [TEXT.INJECTION_TYPE_BEARER, TEXT.INJECTION_TYPE_HEADER],
                description: TEXT.INPUT_DESC_INJECTION_TYPE
              }
            },
            required: TEXT.SCHEMA_REQUIRED_ACTION
          }
        },
        required: TEXT.SCHEMA_REQUIRED_USE_SECRET
      }
    };
  }

  getTool(): Tool {
    return this.tool;
  }

  /**
   * Helper method to write audit entries with consistent formatting
   */
  private async auditRequest(
    context: Partial<AuditContext>,
    outcome: typeof TEXT.AUDIT_OUTCOME_SUCCESS | typeof TEXT.AUDIT_OUTCOME_DENIED | typeof TEXT.AUDIT_OUTCOME_ERROR,
    reason: string
  ): Promise<void> {
    await this.auditService.write({
      secretId: context.secretId || TEXT.FIELD_VALUE_UNKNOWN,
      action: context.action || TEXT.FIELD_VALUE_UNKNOWN,
      domain: context.domain || TEXT.FIELD_VALUE_UNKNOWN,
      timestamp: new Date().toISOString(),
      outcome,
      reason
    });
  }

  /**
   * Parses and validates arguments using the schema
   */
  private parseAndValidateArgs(args: unknown): UseSecretArgs {
    const validatedArgs = UseSecretSchema.parse(args) as UseSecretArgs;
    new URL(validatedArgs.action.url); // Validate URL format
    return validatedArgs;
  }

  /**
   * Handles validation failures with audit logging
   */
  private async handleValidationFailure(args: unknown, validationError: unknown): Promise<never> {
    const rawArgs = args as any;
    await this.auditRequest(
      {
        secretId: rawArgs?.secretId,
        action: rawArgs?.action?.type,
        domain: undefined
      },
      TEXT.AUDIT_OUTCOME_DENIED,
      TEXT.ERROR_INVALID_REQUEST
    );
    throw validationError;
  }

  /**
   * Validates input arguments and extracts request parameters
   */
  private async validateAndExtractRequest(args: unknown): Promise<ValidatedRequest> {
    try {
      const validatedArgs = this.parseAndValidateArgs(args);
      const url = new URL(validatedArgs.action.url);
      
      return {
        secretId: validatedArgs.secretId,
        action: validatedArgs.action,
        domain: url.hostname
      };
    } catch (validationError) {
      return await this.handleValidationFailure(args, validationError);
    }
  }

  /**
   * Enforces rate limiting for the request
   */
  private async enforceRateLimit(secretId: string, domain: string, action?: string): Promise<void> {
    // Get policy to use per-secret rate limits
    const policy = this.policyProvider.getPolicy(secretId);
    
    // Use secretId as rate limit key (per-secret, not per-domain)
    const rateLimitKey = secretId;
    
    // Use policy rate limits if available, otherwise defaults
    const limit = policy?.rateLimit?.requests;
    const windowSeconds = policy?.rateLimit?.windowSeconds;
    
    const rateCheck = limit && windowSeconds
      ? this.rateLimiter.checkLimit(rateLimitKey, limit, windowSeconds)
      : this.rateLimiter.checkLimit(rateLimitKey);
    
    if (!rateCheck.allowed) {
      await this.auditRequest(
        { secretId, action, domain },
        TEXT.AUDIT_OUTCOME_DENIED,
        TEXT.ERROR_RATE_LIMITED
      );
      
      writeError(TEXT.ERROR_RATE_LIMITED, {
        level: CONFIG.LOG_LEVEL_WARN,
        code: CONFIG.ERROR_CODE_RATE_LIMITED,
        secretId,
        domain,
        resetAt: new Date(rateCheck.resetAt).toISOString()
      });
      
      throw new ToolError(TEXT.ERROR_RATE_LIMITED, CONFIG.ERROR_CODE_RATE_LIMITED);
    }
  }

  /**
   * Verifies that the secret exists and is available
   */
  private async verifySecretExists(secretId: string, action: string, domain: string): Promise<void> {
    const secretInfo = this.secretProvider.getSecretInfo(secretId);
    
    if (!secretInfo || !secretInfo.available) {
      await this.auditRequest(
        { secretId, action, domain },
        TEXT.AUDIT_OUTCOME_DENIED,
        TEXT.ERROR_UNKNOWN_SECRET
      );
      
      throw new ToolError(
        TEXT.ERROR_UNKNOWN_SECRET,
        CONFIG.ERROR_CODE_UNKNOWN_SECRET
      );
    }
  }

  /**
   * Checks policy access and handles denial
   */
  private async checkPolicyAccess(secretId: string, action: string, domain: string): Promise<void> {
    const accessDecision = this.policyProvider.evaluate(secretId, action, domain);
    
    if (!accessDecision.allowed) {
      await this.auditRequest(
        { secretId, action, domain },
        TEXT.AUDIT_OUTCOME_DENIED,
        accessDecision.message || TEXT.ERROR_FORBIDDEN_ACTION
      );
      
      const errorCode = accessDecision.code || CONFIG.ERROR_CODE_FORBIDDEN_ACTION;
      const errorMessage = accessDecision.message || TEXT.ERROR_FORBIDDEN_ACTION;
      throw new ToolError(errorMessage, errorCode);
    }
  }

  /**
   * Handles unexpected policy evaluation errors
   */
  private async handlePolicyError(_policyError: unknown, secretId: string, action: string, domain: string): Promise<void> {
    await this.auditRequest(
      { secretId, action, domain },
      TEXT.AUDIT_OUTCOME_ERROR,
      TEXT.ERROR_EXECUTION_FAILED  // Always use TEXT constant, never raw error.message
    );
    throw new ToolError(TEXT.ERROR_EXECUTION_FAILED, CONFIG.ERROR_CODE_EXECUTION_FAILED);
  }

  /**
   * Evaluates access policy for the request
   */
  private async evaluateAccessPolicy(secretId: string, action: string, domain: string): Promise<void> {
    try {
      await this.checkPolicyAccess(secretId, action, domain);
    } catch (policyError) {
      // All errors are normalized to ToolError at boundaries
      // Re-throw if already a ToolError (has a code property that's in our table)
      const error = policyError as any;
      if (error?.code && RESPONSE_BY_CODE[error.code]) {
        throw policyError;
      }
      
      // For unexpected policy evaluation errors
      await this.handlePolicyError(policyError, secretId, action, domain);
    }
  }

  /**
   * Retrieves the secret value
   */
  private async retrieveSecretValue(secretId: string, action: string, domain: string): Promise<string> {
    const secretValue = this.secretProvider.getSecretValue(secretId);
    
    if (!secretValue) {
      await this.auditRequest(
        { secretId, action, domain },
        TEXT.AUDIT_OUTCOME_ERROR,
        TEXT.ERROR_MISSING_ENV
      );
      
      throw new ToolError(TEXT.ERROR_MISSING_ENV, CONFIG.ERROR_CODE_MISSING_ENV);
    }
    
    return secretValue;
  }

  /**
   * Performs the actual secret action execution
   */
  private async performSecretAction(
    action: UseSecretArgs['action'],
    secretValue: string
  ): Promise<unknown> {
    // Use dispatch table for HTTP method mapping
    const method = HTTP_METHOD_MAP[action.type];
    const injectionType = action.injectionType || TEXT.INJECTION_TYPE_BEARER;
    
    // Use injection handler from dispatch table
    const injectionHandler = INJECTION_HANDLERS[injectionType];
    const headers = injectionHandler(action.headers || {}, secretValue);
    
    return await this.actionExecutor.execute({
      method,
      url: action.url,
      headers,
      body: action.body,
      secretValue,
      injectionType
    });
  }

  /**
   * Handles action execution errors with audit logging
   */
  private async handleActionError(
    _executorError: unknown,
    context: AuditContext
  ): Promise<never> {
    await this.auditRequest(
      context,
      TEXT.AUDIT_OUTCOME_ERROR,
      TEXT.ERROR_EXECUTION_FAILED  // Always use TEXT constant, never raw error.message
    );
    throw new ToolError(TEXT.ERROR_EXECUTION_FAILED, CONFIG.ERROR_CODE_EXECUTION_FAILED);
  }

  /**
   * Executes the secret action and handles success/error auditing
   */
  private async executeSecretAction(
    action: UseSecretArgs['action'],
    secretValue: string,
    context: AuditContext
  ): Promise<unknown> {
    try {
      const result = await this.performSecretAction(action, secretValue);
      await this.auditRequest(context, TEXT.AUDIT_OUTCOME_SUCCESS, TEXT.SUCCESS_REQUEST_COMPLETED);
      return result;
    } catch (executorError) {
      return await this.handleActionError(executorError, context);
    }
  }

  /**
   * Handles ToolError instances
   * Note: Audit already written at failure site, so we don't audit again here
   */
  private handleToolError(error: ToolError, context: Partial<AuditContext>): UseSecretResponse {
    writeError(error.message, {
      level: CONFIG.LOG_LEVEL_ERROR,
      code: error.code,
      secretId: context.secretId,
      domain: context.domain
    });
    // Use dispatch table for response
    return respondByCode(error.code);
  }

  /**
   * Handles ZodError instances by mapping to ToolError
   */
  private handleZodError(error: z.ZodError): UseSecretResponse {
    const toolError = mapZodErrorToToolError(error);
    writeError(toolError.message, { level: CONFIG.LOG_LEVEL_ERROR, code: toolError.code, details: error.errors });
    // Use dispatch table for response
    return respondByCode(toolError.code);
  }

  /**
   * Handles generic errors with audit logging
   */
  private async handleGenericError(_error: unknown, context: Partial<AuditContext>): Promise<UseSecretResponse> {
    await this.auditRequest(context, TEXT.AUDIT_OUTCOME_ERROR, TEXT.ERROR_EXECUTION_FAILED);
    
    // Never expose raw error.message, always use TEXT constant
    writeError(TEXT.ERROR_EXECUTION_FAILED, { level: CONFIG.LOG_LEVEL_ERROR, code: CONFIG.ERROR_CODE_EXECUTION_FAILED });
    return respondByCode(CONFIG.ERROR_CODE_EXECUTION_FAILED);
  }

  /**
   * Handles execution errors and returns appropriate error responses
   * Uses table-driven dispatch instead of instanceof checks
   */
  private async handleExecutionError(
    error: unknown,
    context: Partial<AuditContext>
  ): Promise<UseSecretResponse> {
    // Check if it's a ToolError by looking for the code property
    const err = error as any;
    if (err?.code && err?.message) {
      return this.handleToolError(err as ToolError, context);
    }
    
    // Check if it's a ZodError by looking for the issues property
    if (err?.issues && Array.isArray(err.issues)) {
      return this.handleZodError(err as z.ZodError);
    }
    
    return await this.handleGenericError(error, context);
  }

  /**
   * Main execution method for the UseSecret tool
   * Orchestrates validation, security checks, and action execution
   */
  async execute(args: unknown): Promise<UseSecretResponse> {
    let context: Partial<AuditContext> = {};
    
    try {
      const validated = await this.validateAndExtractRequest(args);
      context = { 
        secretId: validated.secretId, 
        action: validated.action.type, 
        domain: validated.domain 
      };
      
      await this.enforceRateLimit(validated.secretId, validated.domain, validated.action.type);
      await this.verifySecretExists(validated.secretId, validated.action.type, validated.domain);
      await this.evaluateAccessPolicy(validated.secretId, validated.action.type, validated.domain);
      
      const secretValue = await this.retrieveSecretValue(
        validated.secretId, 
        validated.action.type, 
        validated.domain
      );
      
      const result = await this.executeSecretAction(
        validated.action, 
        secretValue, 
        context as AuditContext
      );
      
      return { success: true, result };
    } catch (error) {
      return this.handleExecutionError(error, context);
    }
  }
}
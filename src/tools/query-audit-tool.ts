import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AuditService, AuditQueryOptions } from '../interfaces/audit.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from '../utils/errors.js';
import { z } from 'zod';

const QueryAuditSchema = z.object({
  secretId: z.string().trim().optional(),
  startTime: z.string().trim().optional(),
  endTime: z.string().trim().optional(),
  outcome: z.enum(['success', 'denied', 'error']).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(CONFIG.AUDIT_MAX_PAGE_SIZE).optional()
}).strict();

export type QueryAuditRequest = z.infer<typeof QueryAuditSchema>;

export interface QueryAuditResponse {
  readonly entries: ReadonlyArray<{
    readonly timestamp: string;
    readonly secretId: string;
    readonly action: string;
    readonly outcome: string;
    readonly reason: string;
    readonly domain?: string;
    readonly method?: string;
  }>;
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export class QueryAuditTool {
  private readonly tool: Tool;

  constructor(private readonly auditService: AuditService) {
    this.tool = {
      name: TEXT.TOOL_AUDIT,
      description: TEXT.TOOL_AUDIT_DESCRIPTION || 'Query audit log entries with filtering and pagination',
      inputSchema: {
        type: 'object',
        properties: {
          secretId: {
            type: 'string',
            description: 'Filter by secret identifier'
          },
          startTime: {
            type: 'string',
            description: 'Start time for filtering (ISO 8601 format)'
          },
          endTime: {
            type: 'string',
            description: 'End time for filtering (ISO 8601 format)'
          },
          outcome: {
            type: 'string',
            enum: ['success', 'denied', 'error'],
            description: 'Filter by outcome'
          },
          page: {
            type: 'number',
            description: 'Page number (starts at 1)'
          },
          pageSize: {
            type: 'number',
            description: `Number of entries per page (max ${CONFIG.AUDIT_MAX_PAGE_SIZE})`
          }
        },
        required: []
      }
    };
  }

  getTool(): Tool {
    return this.tool;
  }

  async execute(args: unknown): Promise<QueryAuditResponse> {
    let validatedArgs: QueryAuditRequest;
    
    try {
      validatedArgs = QueryAuditSchema.parse(args || {});
    } catch (error) {
      throw new ToolError(
        TEXT.ERROR_INVALID_REQUEST,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }

    // Validate time range if provided
    if (validatedArgs.startTime) {
      const start = new Date(validatedArgs.startTime).getTime();
      if (isNaN(start)) {
        throw new ToolError(
          TEXT.ERROR_INVALID_REQUEST,
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
    }
    
    if (validatedArgs.endTime) {
      const end = new Date(validatedArgs.endTime).getTime();
      if (isNaN(end)) {
        throw new ToolError(
          TEXT.ERROR_INVALID_REQUEST,
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
    }
    
    if (validatedArgs.startTime && validatedArgs.endTime) {
      const start = new Date(validatedArgs.startTime).getTime();
      const end = new Date(validatedArgs.endTime).getTime();
      
      if (start > end) {
        throw new ToolError(
          TEXT.ERROR_INVALID_REQUEST,
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
    }

    // Build query options
    const options: AuditQueryOptions = {
      secretId: validatedArgs.secretId,
      startTime: validatedArgs.startTime,
      endTime: validatedArgs.endTime,
      outcome: validatedArgs.outcome,
      page: validatedArgs.page ?? CONFIG.DEFAULT_PAGE_NUMBER,
      pageSize: validatedArgs.pageSize ?? CONFIG.DEFAULT_PAGE_SIZE
    };

    // Query audit entries
    const result = await this.auditService.query(options);

    // Format response with immutable entries
    const formattedEntries = result.entries.map(entry => Object.freeze({
      [TEXT.FIELD_TIMESTAMP]: entry.timestamp,
      [TEXT.FIELD_SECRET_ID]: entry.secretId,
      [TEXT.FIELD_ACTION]: entry.action,
      [TEXT.FIELD_OUTCOME]: entry.outcome,
      [TEXT.FIELD_REASON]: entry.reason,
      ...(entry.domain && { [TEXT.FIELD_DOMAIN]: entry.domain }),
      ...(entry.method && { [TEXT.FIELD_METHOD]: entry.method })
    }));

    return Object.freeze({
      [TEXT.FIELD_ENTRIES]: Object.freeze(formattedEntries),
      [TEXT.FIELD_TOTAL_COUNT]: result.totalCount,
      [TEXT.FIELD_PAGE]: result.page,
      [TEXT.FIELD_PAGE_SIZE]: result.pageSize,
      [TEXT.FIELD_HAS_MORE]: result.hasMore
    });
  }
}
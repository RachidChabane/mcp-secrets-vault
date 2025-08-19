import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AuditService, AuditQueryOptions, AuditQueryResult, AuditEntry } from '../interfaces/audit.interface.js';
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

  private validateArgs(args: unknown): QueryAuditRequest {
    try {
      return QueryAuditSchema.parse(args || {});
    } catch (error) {
      throw new ToolError(
        TEXT.ERROR_INVALID_REQUEST,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
  }

  private validateSingleTime(timeStr: string | undefined): void {
    if (!timeStr) return;
    
    const time = new Date(timeStr).getTime();
    if (isNaN(time)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_REQUEST,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
  }

  private validateTimeOrder(startTime: string, endTime: string): void {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    
    if (start > end) {
      throw new ToolError(
        TEXT.ERROR_INVALID_REQUEST,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
  }

  private validateTimeRange(args: QueryAuditRequest): void {
    this.validateSingleTime(args.startTime);
    this.validateSingleTime(args.endTime);
    
    if (args.startTime && args.endTime) {
      this.validateTimeOrder(args.startTime, args.endTime);
    }
  }

  private buildQueryOptions(args: QueryAuditRequest): AuditQueryOptions {
    return {
      secretId: args.secretId,
      startTime: args.startTime,
      endTime: args.endTime,
      outcome: args.outcome,
      page: args.page ?? CONFIG.DEFAULT_PAGE_NUMBER,
      pageSize: args.pageSize ?? CONFIG.DEFAULT_PAGE_SIZE
    };
  }

  private formatAuditEntry(entry: AuditEntry): Readonly<{
    readonly timestamp: string;
    readonly secretId: string;
    readonly action: string;
    readonly outcome: string;
    readonly reason: string;
    readonly domain?: string;
    readonly method?: string;
  }> {
    return Object.freeze({
      [TEXT.FIELD_TIMESTAMP]: entry.timestamp,
      [TEXT.FIELD_SECRET_ID]: entry.secretId,
      [TEXT.FIELD_ACTION]: entry.action,
      [TEXT.FIELD_OUTCOME]: entry.outcome,
      [TEXT.FIELD_REASON]: entry.reason,
      ...(entry.domain && { [TEXT.FIELD_DOMAIN]: entry.domain }),
      ...(entry.method && { [TEXT.FIELD_METHOD]: entry.method })
    });
  }

  private formatResponse(result: AuditQueryResult): QueryAuditResponse {
    const formattedEntries = result.entries.map((entry: AuditEntry) => 
      this.formatAuditEntry(entry)
    );

    return Object.freeze({
      [TEXT.FIELD_ENTRIES]: Object.freeze(formattedEntries),
      [TEXT.FIELD_TOTAL_COUNT]: result.totalCount,
      [TEXT.FIELD_PAGE]: result.page,
      [TEXT.FIELD_PAGE_SIZE]: result.pageSize,
      [TEXT.FIELD_HAS_MORE]: result.hasMore
    });
  }

  async execute(args: unknown): Promise<QueryAuditResponse> {
    const validatedArgs = this.validateArgs(args);
    this.validateTimeRange(validatedArgs);
    const options = this.buildQueryOptions(validatedArgs);
    const result = await this.auditService.query(options);
    return this.formatResponse(result);
  }
}
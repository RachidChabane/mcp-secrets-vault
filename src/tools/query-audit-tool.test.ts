import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryAuditTool } from './query-audit-tool.js';
import { AuditService, AuditQueryResult, AuditEntry } from '../interfaces/audit.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from '../utils/errors.js';

// Mock audit service
class MockAuditService implements AuditService {
  private entries: AuditEntry[] = [];
  
  async initialize(): Promise<void> {}
  
  async write(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
  
  async rotate(): Promise<void> {}
  
  async query(options?: any): Promise<AuditQueryResult> {
    let filtered = [...this.entries];
    
    // Apply filters
    if (options?.secretId) {
      filtered = filtered.filter(e => e.secretId === options.secretId);
    }
    
    if (options?.outcome) {
      filtered = filtered.filter(e => e.outcome === options.outcome);
    }
    
    if (options?.startTime) {
      const start = new Date(options.startTime).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    
    if (options?.endTime) {
      const end = new Date(options.endTime).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() <= end);
    }
    
    // Sort by timestamp descending
    filtered.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // Apply pagination
    const page = options?.page ?? CONFIG.DEFAULT_PAGE_NUMBER;
    const pageSize = options?.pageSize ?? CONFIG.DEFAULT_PAGE_SIZE;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    const paginated = filtered.slice(startIndex, endIndex);
    
    return {
      entries: paginated,
      totalCount: filtered.length,
      page,
      pageSize,
      hasMore: endIndex < filtered.length
    };
  }
  
  async cleanup(_maxAgeMs: number): Promise<void> {}
  async close(): Promise<void> {}
  
  // Test helper to add entries
  addTestEntry(entry: AuditEntry): void {
    this.entries.push(entry);
  }
  
  // Test helper to clear entries
  clearEntries(): void {
    this.entries = [];
  }
}

describe('QueryAuditTool', () => {
  let tool: QueryAuditTool;
  let mockAuditService: MockAuditService;
  
  beforeEach(() => {
    mockAuditService = new MockAuditService();
    tool = new QueryAuditTool(mockAuditService);
  });
  
  describe('getTool', () => {
    it('should return tool definition with correct metadata', () => {
      const toolDef = tool.getTool();
      
      expect(toolDef.name).toBe(TEXT.TOOL_AUDIT);
      expect(toolDef.description).toBe(TEXT.TOOL_AUDIT_DESCRIPTION);
      expect(toolDef.inputSchema).toBeDefined();
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.properties).toBeDefined();
      expect(toolDef.inputSchema.required).toEqual([]);
    });
    
    it('should define all expected input properties', () => {
      const toolDef = tool.getTool();
      const props = toolDef.inputSchema.properties;
      
      expect(props).toHaveProperty('secretId');
      expect(props).toHaveProperty('startTime');
      expect(props).toHaveProperty('endTime');
      expect(props).toHaveProperty('outcome');
      expect(props).toHaveProperty('page');
      expect(props).toHaveProperty('pageSize');
    });
  });
  
  describe('execute', () => {
    const sampleEntry1: AuditEntry = {
      timestamp: '2024-01-01T10:00:00Z',
      secretId: 'api_key',
      action: 'http_get',
      outcome: 'success',
      reason: 'Allowed by policy',
      domain: 'api.example.com',
      method: 'GET'
    };
    
    const sampleEntry2: AuditEntry = {
      timestamp: '2024-01-01T11:00:00Z',
      secretId: 'db_password',
      action: 'http_post',
      outcome: 'denied',
      reason: 'Domain not allowed',
      domain: 'evil.com',
      method: 'POST'
    };
    
    const sampleEntry3: AuditEntry = {
      timestamp: '2024-01-01T12:00:00Z',
      secretId: 'api_key',
      action: 'http_get',
      outcome: 'error',
      reason: 'Network timeout'
    };
    
    beforeEach(() => {
      mockAuditService.clearEntries();
      mockAuditService.addTestEntry(sampleEntry1);
      mockAuditService.addTestEntry(sampleEntry2);
      mockAuditService.addTestEntry(sampleEntry3);
    });
    
    it('should return all entries when no filters provided', async () => {
      const result = await tool.execute({});
      
      expect(result[TEXT.FIELD_ENTRIES]).toHaveLength(3);
      expect(result[TEXT.FIELD_TOTAL_COUNT]).toBe(3);
      expect(result[TEXT.FIELD_PAGE]).toBe(1);
      expect(result[TEXT.FIELD_HAS_MORE]).toBe(false);
    });
    
    it('should filter by secretId', async () => {
      const result = await tool.execute({ secretId: 'api_key' });
      
      expect(result[TEXT.FIELD_ENTRIES]).toHaveLength(2);
      expect(result[TEXT.FIELD_TOTAL_COUNT]).toBe(2);
      expect(result[TEXT.FIELD_ENTRIES][0]![TEXT.FIELD_SECRET_ID]).toBe('api_key');
      expect(result[TEXT.FIELD_ENTRIES][1]![TEXT.FIELD_SECRET_ID]).toBe('api_key');
    });
    
    it('should filter by outcome', async () => {
      const result = await tool.execute({ outcome: 'denied' });
      
      expect(result[TEXT.FIELD_ENTRIES]).toHaveLength(1);
      expect(result[TEXT.FIELD_TOTAL_COUNT]).toBe(1);
      expect(result[TEXT.FIELD_ENTRIES][0]![TEXT.FIELD_OUTCOME]).toBe('denied');
    });
    
    it('should filter by time range', async () => {
      const result = await tool.execute({
        startTime: '2024-01-01T10:30:00Z',
        endTime: '2024-01-01T11:30:00Z'
      });
      
      expect(result[TEXT.FIELD_ENTRIES]).toHaveLength(1);
      expect(result[TEXT.FIELD_ENTRIES][0]![TEXT.FIELD_SECRET_ID]).toBe('db_password');
    });
    
    it('should support pagination', async () => {
      const result = await tool.execute({
        page: 1,
        pageSize: 2
      });
      
      expect(result[TEXT.FIELD_ENTRIES]).toHaveLength(2);
      expect(result[TEXT.FIELD_PAGE]).toBe(1);
      expect(result[TEXT.FIELD_PAGE_SIZE]).toBe(2);
      expect(result[TEXT.FIELD_HAS_MORE]).toBe(true);
      
      const page2 = await tool.execute({
        page: 2,
        pageSize: 2
      });
      
      expect(page2[TEXT.FIELD_ENTRIES]).toHaveLength(1);
      expect(page2[TEXT.FIELD_PAGE]).toBe(2);
      expect(page2[TEXT.FIELD_HAS_MORE]).toBe(false);
    });
    
    it('should combine multiple filters', async () => {
      const result = await tool.execute({
        secretId: 'api_key',
        outcome: 'success'
      });
      
      expect(result[TEXT.FIELD_ENTRIES]).toHaveLength(1);
      expect(result[TEXT.FIELD_ENTRIES][0]![TEXT.FIELD_SECRET_ID]).toBe('api_key');
      expect(result[TEXT.FIELD_ENTRIES][0]![TEXT.FIELD_OUTCOME]).toBe('success');
    });
    
    it('should return entries sorted by timestamp descending', async () => {
      const result = await tool.execute({});
      
      const timestamps = result[TEXT.FIELD_ENTRIES].map(
        (e: any) => e[TEXT.FIELD_TIMESTAMP]
      );
      
      expect(timestamps[0]).toBe('2024-01-01T12:00:00Z');
      expect(timestamps[1]).toBe('2024-01-01T11:00:00Z');
      expect(timestamps[2]).toBe('2024-01-01T10:00:00Z');
    });
    
    it('should include optional fields when present', async () => {
      const result = await tool.execute({});
      
      const entryWithDomain = result[TEXT.FIELD_ENTRIES].find(
        (e: any) => e[TEXT.FIELD_DOMAIN] === 'api.example.com'
      );
      
      expect(entryWithDomain).toBeDefined();
      expect(entryWithDomain![TEXT.FIELD_METHOD]).toBe('GET');
    });
    
    it('should not include optional fields when absent', async () => {
      const result = await tool.execute({});
      
      const entryWithoutDomain = result[TEXT.FIELD_ENTRIES].find(
        (e: any) => e[TEXT.FIELD_REASON] === 'Network timeout'
      );
      
      expect(entryWithoutDomain).toBeDefined();
      expect(entryWithoutDomain![TEXT.FIELD_DOMAIN]).toBeUndefined();
      expect(entryWithoutDomain![TEXT.FIELD_METHOD]).toBeUndefined();
    });
    
    it('should return immutable response', async () => {
      const result = await tool.execute({});
      
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result[TEXT.FIELD_ENTRIES])).toBe(true);
      
      if (result[TEXT.FIELD_ENTRIES].length > 0) {
        expect(Object.isFrozen(result[TEXT.FIELD_ENTRIES][0])).toBe(true);
      }
    });
    
    it('should handle empty results', async () => {
      mockAuditService.clearEntries();
      
      const result = await tool.execute({});
      
      expect(result[TEXT.FIELD_ENTRIES]).toHaveLength(0);
      expect(result[TEXT.FIELD_TOTAL_COUNT]).toBe(0);
      expect(result[TEXT.FIELD_HAS_MORE]).toBe(false);
    });
    
    it('should validate page size limit', async () => {
      await expect(tool.execute({
        pageSize: CONFIG.AUDIT_MAX_PAGE_SIZE + 1
      })).rejects.toThrow(ToolError);
    });
    
    it('should validate positive page number', async () => {
      await expect(tool.execute({
        page: 0
      })).rejects.toThrow(ToolError);
      
      await expect(tool.execute({
        page: -1
      })).rejects.toThrow(ToolError);
    });
    
    it('should validate outcome enum values', async () => {
      await expect(tool.execute({
        outcome: 'invalid' as any
      })).rejects.toThrow(ToolError);
    });
    
    it('should reject invalid time format', async () => {
      await expect(tool.execute({
        startTime: 'not-a-date'
      })).rejects.toThrow(ToolError);
    });
    
    it('should reject when start time is after end time', async () => {
      await expect(tool.execute({
        startTime: '2024-01-02T00:00:00Z',
        endTime: '2024-01-01T00:00:00Z'
      })).rejects.toThrow(ToolError);
    });
    
    it('should trim string inputs', async () => {
      const result = await tool.execute({
        secretId: '  api_key  ',
        startTime: '  2024-01-01T00:00:00Z  ',
        endTime: '  2024-01-02T00:00:00Z  '
      });
      
      // Should work without errors after trimming
      expect(result[TEXT.FIELD_ENTRIES]).toBeDefined();
    });
    
    it('should handle null/undefined args gracefully', async () => {
      const result1 = await tool.execute(null);
      expect(result1[TEXT.FIELD_ENTRIES]).toBeDefined();
      
      const result2 = await tool.execute(undefined);
      expect(result2[TEXT.FIELD_ENTRIES]).toBeDefined();
      
      const result3 = await tool.execute({});
      expect(result3[TEXT.FIELD_ENTRIES]).toBeDefined();
    });
    
    it('should reject extra properties in input', async () => {
      await expect(tool.execute({
        secretId: 'api_key',
        extraField: 'not-allowed'
      })).rejects.toThrow(ToolError);
    });
  });
  
  describe('error handling', () => {
    it('should throw ToolError with correct code for invalid request', async () => {
      try {
        await tool.execute({ page: 'not-a-number' as any });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        expect((error as ToolError).code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
        expect((error as ToolError).message).toBe(TEXT.ERROR_INVALID_REQUEST);
      }
    });
    
    it('should handle audit service errors gracefully', async () => {
      const errorService = {
        ...mockAuditService,
        query: vi.fn().mockRejectedValue(new Error('Database error'))
      } as any;
      
      const errorTool = new QueryAuditTool(errorService);
      
      await expect(errorTool.execute({})).rejects.toThrow();
    });
  });
  
  describe('integration scenarios', () => {
    it('should handle large datasets with pagination', async () => {
      mockAuditService.clearEntries();
      
      // Add 100 entries
      for (let i = 0; i < 100; i++) {
        mockAuditService.addTestEntry({
          timestamp: new Date(2024, 0, 1, 10, i).toISOString(),
          secretId: `secret_${i % 5}`,
          action: 'http_get',
          outcome: i % 3 === 0 ? 'success' : i % 3 === 1 ? 'denied' : 'error',
          reason: `Test reason ${i}`
        });
      }
      
      const page1 = await tool.execute({ pageSize: 20 });
      expect(page1[TEXT.FIELD_ENTRIES]).toHaveLength(20);
      expect(page1[TEXT.FIELD_TOTAL_COUNT]).toBe(100);
      expect(page1[TEXT.FIELD_HAS_MORE]).toBe(true);
      
      const page5 = await tool.execute({ page: 5, pageSize: 20 });
      expect(page5[TEXT.FIELD_ENTRIES]).toHaveLength(20);
      expect(page5[TEXT.FIELD_HAS_MORE]).toBe(false);
    });
    
    it('should handle complex filter combinations', async () => {
      mockAuditService.clearEntries();
      
      // Add varied test data
      const now = new Date('2024-01-15T12:00:00Z');
      
      for (let days = -10; days <= 10; days++) {
        const timestamp = new Date(now);
        timestamp.setDate(timestamp.getDate() + days);
        
        mockAuditService.addTestEntry({
          timestamp: timestamp.toISOString(),
          secretId: days < 0 ? 'old_secret' : 'new_secret',
          action: 'http_get',
          outcome: days % 2 === 0 ? 'success' : 'denied',
          reason: `Day ${days}`
        });
      }
      
      // Query recent successful uses of new_secret
      const result = await tool.execute({
        secretId: 'new_secret',
        outcome: 'success',
        startTime: '2024-01-15T00:00:00Z'
      });
      
      expect(result[TEXT.FIELD_TOTAL_COUNT]).toBeGreaterThan(0);
      result[TEXT.FIELD_ENTRIES].forEach((entry: any) => {
        expect(entry[TEXT.FIELD_SECRET_ID]).toBe('new_secret');
        expect(entry[TEXT.FIELD_OUTCOME]).toBe('success');
        expect(new Date(entry[TEXT.FIELD_TIMESTAMP]).getTime())
          .toBeGreaterThanOrEqual(new Date('2024-01-15T00:00:00Z').getTime());
      });
    });
  });
});
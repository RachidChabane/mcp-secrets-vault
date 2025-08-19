import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryAuditTool } from './query-audit-tool.js';
import { JsonlAuditService } from '../services/audit-service.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('QueryAuditTool Integration', () => {
  let tool: QueryAuditTool;
  let auditService: JsonlAuditService;
  let tempDir: string;
  
  beforeEach(async () => {
    // Create temp directory for audit files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-test-'));
    
    // Initialize real audit service
    auditService = new JsonlAuditService(tempDir);
    await auditService.initialize();
    
    // Create tool with real service
    tool = new QueryAuditTool(auditService);
  });
  
  afterEach(async () => {
    // Cleanup
    await auditService.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  describe('MCP SDK Integration', () => {
    it('should provide correct tool definition for MCP', () => {
      const toolDef = tool.getTool();
      
      // Verify MCP tool structure
      expect(toolDef).toHaveProperty('name');
      expect(toolDef).toHaveProperty('description');
      expect(toolDef).toHaveProperty('inputSchema');
      
      // Verify schema is MCP-compatible JSON Schema
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.properties).toBeDefined();
      expect(Array.isArray(toolDef.inputSchema.required)).toBe(true);
    });
    
    it('should handle MCP-style arguments', async () => {
      // Write some test data
      await auditService.write({
        timestamp: new Date().toISOString(),
        secretId: 'test_secret',
        action: 'http_get',
        outcome: 'success',
        reason: 'Test entry',
        domain: 'api.example.com'
      });
      
      // Execute with MCP-style args (as would come from SDK)
      const result = await tool.execute({
        secretId: 'test_secret',
        page: 1,
        pageSize: 10
      });
      
      // Verify response structure matches MCP expectations
      expect(result).toHaveProperty(TEXT.FIELD_ENTRIES);
      expect(result).toHaveProperty(TEXT.FIELD_TOTAL_COUNT);
      expect(result).toHaveProperty(TEXT.FIELD_PAGE);
      expect(result).toHaveProperty(TEXT.FIELD_PAGE_SIZE);
      expect(result).toHaveProperty(TEXT.FIELD_HAS_MORE);
      
      // Verify response is JSON-serializable
      const serialized = JSON.stringify(result);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(result);
    });
  });
  
  describe('Real Audit Service Integration', () => {
    it('should query real audit entries from JSONL files', async () => {
      // Write multiple entries
      const entries = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          secretId: 'api_key',
          action: 'http_get',
          outcome: 'success' as const,
          reason: 'Allowed by policy',
          domain: 'api.openai.com'
        },
        {
          timestamp: '2024-01-01T11:00:00Z',
          secretId: 'db_password',
          action: 'http_post',
          outcome: 'denied' as const,
          reason: 'Domain not allowed'
        },
        {
          timestamp: '2024-01-01T12:00:00Z',
          secretId: 'api_key',
          action: 'http_post',
          outcome: 'error' as const,
          reason: 'Network timeout'
        }
      ];
      
      for (const entry of entries) {
        await auditService.write(entry);
      }
      
      // Query all entries
      const allResult = await tool.execute({});
      expect(allResult[TEXT.FIELD_ENTRIES]).toHaveLength(3);
      expect(allResult[TEXT.FIELD_TOTAL_COUNT]).toBe(3);
      
      // Query with filter
      const filteredResult = await tool.execute({
        secretId: 'api_key'
      });
      expect(filteredResult[TEXT.FIELD_ENTRIES]).toHaveLength(2);
      
      // Query with pagination
      const page1 = await tool.execute({
        pageSize: 2
      });
      expect(page1[TEXT.FIELD_ENTRIES]).toHaveLength(2);
      expect(page1[TEXT.FIELD_HAS_MORE]).toBe(true);
      
      const page2 = await tool.execute({
        page: 2,
        pageSize: 2
      });
      expect(page2[TEXT.FIELD_ENTRIES]).toHaveLength(1);
      expect(page2[TEXT.FIELD_HAS_MORE]).toBe(false);
    });
    
    it('should handle file rotation correctly', async () => {
      // Force rotation by writing entries
      await auditService.rotate();
      
      // Write to first file
      await auditService.write({
        timestamp: '2024-01-01T10:00:00Z',
        secretId: 'old_secret',
        action: 'http_get',
        outcome: 'success',
        reason: 'Old entry'
      });
      
      // Force another rotation
      await auditService.rotate();
      
      // Write to new file
      await auditService.write({
        timestamp: '2024-01-02T10:00:00Z',
        secretId: 'new_secret',
        action: 'http_post',
        outcome: 'success',
        reason: 'New entry'
      });
      
      // Query should find entries from both files
      const result = await tool.execute({});
      expect(result[TEXT.FIELD_ENTRIES]).toHaveLength(2);
      expect(result[TEXT.FIELD_TOTAL_COUNT]).toBe(2);
    });
    
    it('should handle concurrent writes and queries', async () => {
      // Simulate concurrent operations
      const writePromises = [];
      const queryPromises = [];
      
      // Start concurrent writes
      for (let i = 0; i < 10; i++) {
        writePromises.push(
          auditService.write({
            timestamp: new Date(2024, 0, 1, 10, i).toISOString(),
            secretId: `secret_${i}`,
            action: 'http_get',
            outcome: 'success',
            reason: `Entry ${i}`
          })
        );
      }
      
      // Start concurrent queries
      for (let i = 0; i < 5; i++) {
        queryPromises.push(
          tool.execute({ page: i + 1, pageSize: 2 })
        );
      }
      
      // Wait for all operations
      await Promise.all(writePromises);
      const queryResults = await Promise.all(queryPromises);
      
      // Verify queries completed without errors
      queryResults.forEach(result => {
        expect(result).toHaveProperty(TEXT.FIELD_ENTRIES);
        expect(result).toHaveProperty(TEXT.FIELD_TOTAL_COUNT);
      });
      
      // Final query should see all entries
      const finalResult = await tool.execute({});
      expect(finalResult[TEXT.FIELD_TOTAL_COUNT]).toBe(10);
    });
    
    it('should handle empty audit directory gracefully', async () => {
      // Query empty audit log
      const result = await tool.execute({});
      
      expect(result[TEXT.FIELD_ENTRIES]).toEqual([]);
      expect(result[TEXT.FIELD_TOTAL_COUNT]).toBe(0);
      expect(result[TEXT.FIELD_HAS_MORE]).toBe(false);
    });
    
    it('should validate and reject malformed input', async () => {
      // Test various invalid inputs
      await expect(tool.execute({
        pageSize: CONFIG.AUDIT_MAX_PAGE_SIZE + 100
      })).rejects.toThrow();
      
      await expect(tool.execute({
        page: -5
      })).rejects.toThrow();
      
      await expect(tool.execute({
        outcome: 'invalid_outcome' as any
      })).rejects.toThrow();
      
      await expect(tool.execute({
        startTime: '2024-01-02T00:00:00Z',
        endTime: '2024-01-01T00:00:00Z'
      })).rejects.toThrow();
    });
  });
  
  describe('Performance', () => {
    it('should handle large datasets efficiently', async () => {
      // Write many entries
      const entryCount = 1000;
      const startWrite = Date.now();
      
      for (let i = 0; i < entryCount; i++) {
        await auditService.write({
          timestamp: new Date(2024, 0, 1, 0, 0, i).toISOString(),
          secretId: `secret_${i % 10}`,
          action: i % 2 === 0 ? 'http_get' : 'http_post',
          outcome: i % 3 === 0 ? 'success' : i % 3 === 1 ? 'denied' : 'error',
          reason: `Test entry ${i}`
        });
      }
      
      const writeTime = Date.now() - startWrite;
      console.log(`Written ${entryCount} entries in ${writeTime}ms`);
      
      // Query with filters
      const startQuery = Date.now();
      const result = await tool.execute({
        secretId: 'secret_5',
        outcome: 'success',
        pageSize: 20
      });
      const queryTime = Date.now() - startQuery;
      
      console.log(`Queried ${result[TEXT.FIELD_TOTAL_COUNT]} filtered entries in ${queryTime}ms`);
      
      // Performance assertions
      expect(queryTime).toBeLessThan(1000); // Query should complete within 1 second
      expect(result[TEXT.FIELD_ENTRIES]).toBeDefined();
    });
  });
});
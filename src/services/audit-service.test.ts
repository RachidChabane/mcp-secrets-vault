import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { JsonlAuditService } from './audit-service.js';
import { CONFIG } from '../constants/config-constants.js';
import type { AuditEntry } from '../interfaces/audit.interface.js';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    appendFile: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn()
  }
}));

describe('JsonlAuditService', () => {
  let service: JsonlAuditService;
  const testDir = '/tmp/audit-test';
  const mockFs = fs as any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new JsonlAuditService(testDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should create audit directory', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await service.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testDir, { recursive: true });
    });

    it('should only initialize once', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await service.initialize();
      await service.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledTimes(1);
    });

    it('should use existing audit file if not requiring rotation', async () => {
      const existingFile = `${CONFIG.AUDIT_FILE_PREFIX}-2024-01-01${CONFIG.AUDIT_FILE_EXTENSION}`;
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([existingFile]);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date(),
        isFile: () => true
      });

      await service.initialize();

      expect(mockFs.readdir).toHaveBeenCalledWith(testDir);
    });
  });

  describe('write', () => {
    const testEntry: AuditEntry = {
      timestamp: '2024-01-01T00:00:00.000Z',
      secretId: 'test-secret',
      action: 'http_get',
      outcome: 'success',
      reason: 'Request allowed',
      domain: 'api.example.com'
    };

    it('should write entry to current file', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date()
      });

      await service.write(testEntry);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining(CONFIG.AUDIT_FILE_PREFIX),
        JSON.stringify(testEntry) + '\n',
        CONFIG.DEFAULT_ENCODING
      );
    });

    it('should initialize if not already initialized', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date()
      });

      await service.write(testEntry);

      expect(mockFs.mkdir).toHaveBeenCalled();
    });

    it('should rotate file when size exceeds limit', async () => {
      const largeSizeBytes = (CONFIG.AUDIT_MAX_FILE_SIZE_MB + 1) * 1024 * 1024;
      
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: largeSizeBytes,
        birthtime: new Date()
      });

      await service.initialize();
      await service.write(testEntry);

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining(CONFIG.AUDIT_FILE_PREFIX),
        expect.any(String),
        CONFIG.DEFAULT_ENCODING
      );
    });

    it('should rotate file when age exceeds limit', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - CONFIG.AUDIT_MAX_FILE_AGE_DAYS - 1);
      
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: oldDate
      });

      await service.initialize();
      await service.write(testEntry);

      expect(mockFs.appendFile).toHaveBeenCalled();
    });

    it('should never expose sensitive data in entries', async () => {
      const sensitiveEntry: AuditEntry = {
        timestamp: '2024-01-01T00:00:00.000Z',
        secretId: 'api_key',
        action: 'http_post',
        outcome: 'denied',
        reason: 'Domain not allowed',
        domain: 'evil.com'
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date()
      });

      await service.write(sensitiveEntry);

      const writtenContent = mockFs.appendFile.mock.calls[0][1];
      expect(writtenContent).not.toContain('envVar');
      expect(writtenContent).not.toContain('Bearer');
      expect(writtenContent).not.toContain('Authorization');
    });
  });

  describe('query', () => {
    const mockEntries: AuditEntry[] = [
      {
        timestamp: '2024-01-03T00:00:00.000Z',
        secretId: 'secret1',
        action: 'http_get',
        outcome: 'success',
        reason: 'Allowed'
      },
      {
        timestamp: '2024-01-02T00:00:00.000Z',
        secretId: 'secret2',
        action: 'http_post',
        outcome: 'denied',
        reason: 'Rate limited'
      },
      {
        timestamp: '2024-01-01T00:00:00.000Z',
        secretId: 'secret1',
        action: 'http_get',
        outcome: 'error',
        reason: 'Timeout'
      }
    ];

    beforeEach(() => {
      const jsonlContent = mockEntries.map(e => JSON.stringify(e)).join('\n');
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['audit-2024.jsonl']);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date(),
        isFile: () => true
      });
      mockFs.readFile.mockResolvedValue(jsonlContent);
    });

    it('should return all entries when no filters applied', async () => {
      const result = await service.query();

      expect(result.entries).toHaveLength(3);
      expect(result.totalCount).toBe(3);
    });

    it('should filter by secretId', async () => {
      const result = await service.query({ secretId: 'secret1' });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.secretId === 'secret1')).toBe(true);
    });

    it('should filter by outcome', async () => {
      const result = await service.query({ outcome: 'denied' });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.outcome).toBe('denied');
    });

    it('should filter by time range', async () => {
      const result = await service.query({
        startTime: '2024-01-02T00:00:00.000Z',
        endTime: '2024-01-03T00:00:00.000Z'
      });

      expect(result.entries).toHaveLength(2);
    });

    it('should paginate results', async () => {
      const result = await service.query({ page: 1, pageSize: 2 });

      expect(result.entries).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should sort entries by timestamp descending', async () => {
      const result = await service.query();

      expect(result.entries[0]?.timestamp).toBe('2024-01-03T00:00:00.000Z');
      expect(result.entries[1]?.timestamp).toBe('2024-01-02T00:00:00.000Z');
      expect(result.entries[2]?.timestamp).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle empty audit directory', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const result = await service.query();

      expect(result.entries).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('should handle malformed JSON lines', async () => {
      const badContent = 'invalid json\n' + JSON.stringify(mockEntries[0]);
      mockFs.readFile.mockResolvedValue(badContent);

      const result = await service.query();

      expect(result.entries).toHaveLength(1);
    });

    it('should limit page size to maximum', async () => {
      const result = await service.query({ pageSize: 9999 });

      expect(result.pageSize).toBe(CONFIG.AUDIT_MAX_PAGE_SIZE);
    });

    it('should never expose sensitive data in query results', async () => {
      const result = await service.query();

      result.entries.forEach(entry => {
        const entryStr = JSON.stringify(entry);
        expect(entryStr).not.toContain('envVar');
        expect(entryStr).not.toContain('OPENAI_API_KEY');
      });
    });
  });

  describe('cleanup', () => {
    it('should remove old files', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      const newDate = new Date();
      
      mockFs.mkdir.mockResolvedValue(undefined);
      
      // First call for initialize
      mockFs.readdir.mockResolvedValueOnce([]);
      
      // Second call for cleanup
      mockFs.readdir.mockResolvedValueOnce([
        `${CONFIG.AUDIT_FILE_PREFIX}-old${CONFIG.AUDIT_FILE_EXTENSION}`, 
        `${CONFIG.AUDIT_FILE_PREFIX}-new${CONFIG.AUDIT_FILE_EXTENSION}`
      ]);
      
      // Stats for cleanup files
      mockFs.stat
        .mockResolvedValueOnce({
          size: 1024,
          birthtime: oldDate,
          isFile: () => true
        })
        .mockResolvedValueOnce({
          size: 1024,
          birthtime: newDate,
          isFile: () => true
        });
      
      mockFs.unlink.mockResolvedValue(undefined);

      await service.initialize();
      const maxAgeMs = 5 * 24 * 60 * 60 * 1000; // 5 days
      await service.cleanup(maxAgeMs);

      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join(testDir, `${CONFIG.AUDIT_FILE_PREFIX}-old${CONFIG.AUDIT_FILE_EXTENSION}`)
      );
    });

    it('should keep recent files', async () => {
      const recentDate = new Date();
      
      mockFs.readdir.mockResolvedValue(['recent.jsonl']);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: recentDate,
        isFile: () => true
      });
      mockFs.unlink.mockResolvedValue(undefined);

      const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
      await service.cleanup(maxAgeMs);

      expect(mockFs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('rotate', () => {
    it('should create new file with timestamp', async () => {
      const spy = vi.spyOn(Date.prototype, 'toISOString')
        .mockReturnValue('2024-01-01T12:30:45.123Z');

      await service.rotate();

      const expectedFileName = `audit-2024-01-01T12-30-45-123Z.jsonl`;
      
      // Write to trigger using the new file
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date()
      });

      await service.write({
        timestamp: new Date().toISOString(),
        secretId: 'test',
        action: 'test',
        outcome: 'success',
        reason: 'test'
      });

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining(expectedFileName),
        expect.any(String),
        CONFIG.DEFAULT_ENCODING
      );

      spy.mockRestore();
    });
  });

  describe('close', () => {
    it('should reset initialization state', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await service.initialize();
      await service.close();
      await service.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledTimes(2);
    });
  });

  describe('concurrent writes', () => {
    it('should handle concurrent write operations', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date()
      });

      const writes = Array.from({ length: 10 }, (_, i) => 
        service.write({
          timestamp: new Date().toISOString(),
          secretId: `secret${i}`,
          action: 'http_get',
          outcome: 'success',
          reason: 'Test'
        })
      );

      await Promise.all(writes);

      expect(mockFs.appendFile).toHaveBeenCalledTimes(10);
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(service.initialize()).rejects.toThrow('Permission denied');
    });

    it('should handle missing directory in query', async () => {
      const error: any = new Error('Directory not found');
      error.code = CONFIG.FS_ERROR_ENOENT;
      mockFs.readdir.mockRejectedValue(error);

      const result = await service.query();

      expect(result.entries).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('should handle read errors in query', async () => {
      mockFs.readdir.mockResolvedValue(['audit.jsonl']);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date(),
        isFile: () => true
      });
      mockFs.readFile.mockRejectedValue(new Error('Read error'));

      const result = await service.query();

      expect(result.entries).toHaveLength(0);
    });
  });

  describe('security invariants', () => {
    it('should never include envVar field in written entries', async () => {
      const entryWithEnvVar = {
        timestamp: new Date().toISOString(),
        secretId: 'test',
        action: 'http_get',
        outcome: 'success' as const,
        reason: 'Test',
        envVar: 'SECRET_API_KEY' // This should never be written
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date()
      });

      await service.write(entryWithEnvVar as any);

      const writtenContent = mockFs.appendFile.mock.calls[0][1];
      expect(writtenContent).not.toContain('envVar');
      expect(writtenContent).not.toContain('SECRET_API_KEY');
    });

    it('should never expose secret values in errors', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.appendFile.mockRejectedValue(new Error('Cannot write to /secret/path/KEY_VALUE'));

      const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        secretId: 'test',
        action: 'http_get',
        outcome: 'success',
        reason: 'Test'
      };

      await expect(service.write(entry)).rejects.toThrow();
      
      try {
        await service.write(entry);
      } catch (error: any) {
        expect(error.message).not.toContain('Bearer');
        expect(error.message).not.toContain('Authorization');
      }
    });
  });
});
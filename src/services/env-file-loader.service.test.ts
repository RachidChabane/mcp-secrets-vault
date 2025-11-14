import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { EnvFileLoaderService } from './env-file-loader.service.js';

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn()
  }
}));

describe('EnvFileLoaderService', () => {
  let service: EnvFileLoaderService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    service = new EnvFileLoaderService();
    // Clear environment
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadEnvironmentFiles', () => {
    it('should load .env file if it exists', async () => {
      const mockContent = 'TEST_VAR=test_value\nANOTHER_VAR=another_value';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      await service.loadEnvironmentFiles();

      expect(process.env.TEST_VAR).toBe('test_value');
      expect(process.env.ANOTHER_VAR).toBe('another_value');
    });

    it('should skip non-existent files', async () => {
      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' });

      await service.loadEnvironmentFiles();

      expect(service.getLoadedFiles()).toHaveLength(0);
    });

    it('should load environment-specific files', async () => {
      process.env.NODE_ENV = 'development';

      const mockContent = 'DEV_VAR=dev_value';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      await service.loadEnvironmentFiles();

      expect(process.env.DEV_VAR).toBe('dev_value');
    });

    it('should handle quoted values', async () => {
      const mockContent = 'QUOTED_VAR="quoted value"\nSINGLE_QUOTED=\'single quoted\'';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      await service.loadEnvironmentFiles();

      expect(process.env.QUOTED_VAR).toBe('quoted value');
      expect(process.env.SINGLE_QUOTED).toBe('single quoted');
    });

    it('should skip comments and empty lines', async () => {
      const mockContent = '# This is a comment\n\nVAR=value\n# Another comment';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      await service.loadEnvironmentFiles();

      expect(process.env.VAR).toBe('value');
    });

    it('should not override existing environment variables', async () => {
      process.env.EXISTING_VAR = 'original';

      const mockContent = 'EXISTING_VAR=new_value';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      await service.loadEnvironmentFiles();

      expect(process.env.EXISTING_VAR).toBe('original');
    });
  });

  describe('getLoadedFiles', () => {
    it('should return list of loaded files', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('VAR=value');

      await service.loadEnvironmentFiles();

      const loaded = service.getLoadedFiles();
      expect(Array.isArray(loaded)).toBe(true);
      expect(loaded.length).toBeGreaterThan(0);
    });

    it('should return empty array if no files loaded', async () => {
      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' });

      await service.loadEnvironmentFiles();

      expect(service.getLoadedFiles()).toHaveLength(0);
    });
  });
});

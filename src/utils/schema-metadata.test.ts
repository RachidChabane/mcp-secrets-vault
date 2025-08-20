import { describe, it, expect } from 'vitest';
import { generateSchemaId, getJsonSchemaDraft, getSchemaName } from './schema-metadata.js';
import { CONFIG } from '../constants/config-constants.js';

describe('Schema Metadata Utilities', () => {
  describe('generateSchemaId', () => {
    it('should generate a deterministic schema ID', () => {
      const id1 = generateSchemaId();
      const id2 = generateSchemaId();
      
      // Should be deterministic - same output for same inputs
      expect(id1).toBe(id2);
    });

    it('should include the expected components', () => {
      const id = generateSchemaId();
      
      // Should contain prefix, version, and filename
      expect(id).toContain(CONFIG.JSON_SCHEMA_ID_PREFIX);
      expect(id).toContain(CONFIG.JSON_SCHEMA_VERSION);
      expect(id).toContain(CONFIG.JSON_SCHEMA_FILENAME);
    });

    it('should follow the expected format', () => {
      const id = generateSchemaId();
      
      // Format: prefix:version:hash:filename
      const parts = id.split(':');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe(CONFIG.JSON_SCHEMA_ID_PREFIX);
      expect(parts[1]).toBe(CONFIG.JSON_SCHEMA_VERSION);
      expect(parts[2]).toMatch(/^[a-f0-9]{8}$/); // 8-char hex hash
      expect(parts[3]).toBe(CONFIG.JSON_SCHEMA_FILENAME);
    });

    it('should not contain repository URLs', () => {
      const id = generateSchemaId();
      
      // Should not contain any URL patterns
      expect(id).not.toContain('http');
      expect(id).not.toContain('github');
      expect(id).not.toContain('.com');
      expect(id).not.toContain('/');
    });

    it('should be stable across different environments', () => {
      const id = generateSchemaId();
      
      // The ID should not depend on environment variables or system paths
      expect(id).not.toContain(process.cwd());
      expect(id).not.toContain(process.env['HOME'] || '');
      expect(id).not.toContain(process.env['USER'] || '');
    });
  });

  describe('getJsonSchemaDraft', () => {
    it('should return the JSON Schema draft URL from constants', () => {
      const draft = getJsonSchemaDraft();
      
      expect(draft).toBe(CONFIG.JSON_SCHEMA_DRAFT);
      expect(draft).toContain('json-schema.org');
      expect(draft).toContain('draft-07');
    });
  });

  describe('getSchemaName', () => {
    it('should return the schema name from constants', () => {
      const name = getSchemaName();
      
      expect(name).toBe(CONFIG.JSON_SCHEMA_NAME);
      expect(name).toBe('VaultConfig');
    });
  });
});
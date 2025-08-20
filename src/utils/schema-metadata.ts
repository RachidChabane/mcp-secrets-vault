import { CONFIG } from '../constants/config-constants.js';
import { createHash } from 'crypto';

/**
 * Generate a deterministic, stable schema ID that doesn't depend on repository URL
 * Uses a hash of the schema prefix, version, and filename for stability
 */
export function generateSchemaId(): string {
  // Create a deterministic ID based on stable components
  const components = [
    CONFIG.JSON_SCHEMA_ID_PREFIX,
    CONFIG.JSON_SCHEMA_VERSION,
    CONFIG.JSON_SCHEMA_FILENAME
  ];
  
  // Generate a short hash for uniqueness while maintaining stability
  const hash = createHash('sha256')
    .update(components.join(':'))
    .digest('hex')
    .substring(0, 8);
  
  // Format: prefix:version:hash:filename
  return `${CONFIG.JSON_SCHEMA_ID_PREFIX}:${CONFIG.JSON_SCHEMA_VERSION}:${hash}:${CONFIG.JSON_SCHEMA_FILENAME}`;
}

/**
 * Get the JSON Schema draft URL from constants
 */
export function getJsonSchemaDraft(): string {
  return CONFIG.JSON_SCHEMA_DRAFT;
}

/**
 * Get the schema name from constants
 */
export function getSchemaName(): string {
  return CONFIG.JSON_SCHEMA_NAME;
}
#!/usr/bin/env node

import { zodToJsonSchema } from 'zod-to-json-schema';
import { VaultConfigSchema } from '../src/schemas/config.schema.js';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG } from '../src/constants/config-constants.js';
import { TEXT } from '../src/constants/text-constants.js';
import { generateSchemaId, getJsonSchemaDraft, getSchemaName } from '../src/utils/schema-metadata.js';
import { writeError, writeInfo } from '../src/utils/logging.js';

async function generateJsonSchema(): Promise<void> {
  try {
    // Generate JSON Schema from Zod schema
    const jsonSchema = zodToJsonSchema(VaultConfigSchema, {
      name: getSchemaName(),
      $refStrategy: 'none',
      errorMessages: true,
      markdownDescription: true,
    });

    // Add metadata from constants
    const schemaWithMetadata = {
      $schema: getJsonSchemaDraft(),
      $id: generateSchemaId(),
      title: TEXT.SCHEMA_TITLE,
      description: TEXT.SCHEMA_DESCRIPTION,
      ...jsonSchema,
    };

    // Enhance domain field descriptions from constants
    // Navigate through the definitions structure
    const vaultConfigDef = (schemaWithMetadata.definitions as any)?.VaultConfig;
    if (vaultConfigDef?.properties?.policies?.items?.properties?.allowedDomains) {
      // Add description to the allowedDomains array
      vaultConfigDef.properties.policies.items.properties.allowedDomains.description = 
        TEXT.SCHEMA_DOMAIN_LIST_DESC;
      
      // Add description to the items within allowedDomains
      if (vaultConfigDef.properties.policies.items.properties.allowedDomains.items) {
        vaultConfigDef.properties.policies.items.properties.allowedDomains.items.description = 
          TEXT.SCHEMA_DOMAIN_ITEM_DESC;
      }
    }

    // Write schema to file
    const outputPath = path.join(process.cwd(), CONFIG.JSON_SCHEMA_FILENAME);
    await fs.writeFile(
      outputPath,
      JSON.stringify(schemaWithMetadata, null, 2),
      'utf-8'
    );

    writeInfo(`${TEXT.SCHEMA_GENERATION_SUCCESS}: ${outputPath}`);
    writeInfo(TEXT.SCHEMA_REMINDER_EXACT_FQDN);
  } catch (error) {
    writeError(TEXT.SCHEMA_GENERATION_FAILED, {
      level: CONFIG.LOG_LEVEL_ERROR,
      code: CONFIG.ERROR_CODE_INVALID_REQUEST,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(CONFIG.EXIT_CODE_ERROR);
  }
}

// Run if executed directly
if (import.meta.url === `${CONFIG.FILE_URL_SCHEME}${process.argv[1]}`) {
  generateJsonSchema();
}

export { generateJsonSchema };
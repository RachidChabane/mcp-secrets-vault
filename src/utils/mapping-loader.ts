import { readFile } from 'fs/promises';
import { z } from 'zod';
import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { ToolError } from './errors.js';
import { mapZodErrorToToolError } from './zod-mapper.js';

const SecretMappingSchema = z.object({
  secretId: z.string().trim().min(CONFIG.MIN_SECRET_ID_LENGTH).max(CONFIG.MAX_SECRET_ID_LENGTH),
  envVar: z.string().trim().min(CONFIG.MIN_ENV_VAR_LENGTH),
  description: z.string().trim().optional()
});

const MappingsFileSchema = z.object({
  mappings: z.array(SecretMappingSchema)
});

export class MappingLoader {
  async loadFromFile(filePath: string): Promise<SecretMapping[]> {
    try {
      const content = await readFile(filePath, CONFIG.DEFAULT_ENCODING);
      const data = JSON.parse(content);
      
      const validated = MappingsFileSchema.parse(data);
      return validated.mappings;
    } catch (error) {
      // Check if it's a ZodError by looking for the issues property
      const err = error as any;
      if (err?.issues && Array.isArray(err.issues)) {
        // Map ZodError to ToolError
        throw mapZodErrorToToolError(err as z.ZodError);
      }
      // Check if it's a SyntaxError by checking the name property
      if (err?.name === 'SyntaxError') {
        throw new ToolError(TEXT.ERROR_INVALID_CONFIG, CONFIG.ERROR_CODE_INVALID_REQUEST);
      }
      // Default to configuration error
      throw new ToolError(TEXT.ERROR_INVALID_CONFIG, CONFIG.ERROR_CODE_INVALID_REQUEST);
    }
  }

  loadFromEnvironment(): SecretMapping[] {
    const envPrefix = CONFIG.ENV_PREFIX;
    const mappings: SecretMapping[] = [];
    const mappingSuffix = '_MAPPING';
    
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith(envPrefix) || !key.endsWith(mappingSuffix)) {
        continue;
      }
      
      if (!value || value.trim().length === 0) {
        continue;
      }
      
      try {
        const mapping = JSON.parse(value);
        const validated = SecretMappingSchema.parse(mapping);
        mappings.push(validated);
      } catch {
        continue;
      }
    }
    
    return mappings;
  }
}
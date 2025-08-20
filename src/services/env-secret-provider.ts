import { SecretProvider, SecretInfo } from '../interfaces/secret-provider.interface.js';
import { SecretAccessor } from '../interfaces/secret-accessor.interface.js';
import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { ConfigurationError } from '../utils/errors.js';
import { validateSecretId, validateEnvVar, isNonEmptyString } from '../utils/validation.js';

interface ValidatedMapping {
  readonly secretId: string;
  readonly envVar: string;
  readonly description?: string;
}

export class EnvSecretProvider implements SecretProvider, SecretAccessor {
  private readonly mappings: ReadonlyMap<string, ValidatedMapping>;
  private readonly secretIds: readonly string[];

  constructor(mappings: readonly SecretMapping[]) {
    const validated = this.validateAndNormalizeMappings(mappings);
    this.mappings = Object.freeze(new Map(validated));
    this.secretIds = Object.freeze(Array.from(this.mappings.keys()).sort());
  }

  private validateAndNormalizeMappings(
    mappings: readonly SecretMapping[]
  ): Array<[string, ValidatedMapping]> {
    const seen = new Set<string>();
    const result: Array<[string, ValidatedMapping]> = [];

    for (const mapping of mappings) {
      const secretId = validateSecretId(mapping.secretId);
      const envVar = validateEnvVar(mapping.envVar);
      
      if (seen.has(secretId)) {
        throw new ConfigurationError(
          TEXT.ERROR_DUPLICATE_SECRET_ID,
          TEXT.FIELD_SECRET_ID
        );
      }
      
      seen.add(secretId);
      
      const validated: ValidatedMapping = Object.freeze({
        secretId,
        envVar,
        description: mapping.description?.trim()
      });
      
      result.push([secretId, validated]);
    }
    
    return result;
  }

  listSecretIds(): readonly string[] {
    return this.secretIds;
  }

  isSecretAvailable(secretId: string): boolean {
    const normalizedId = secretId.trim();
    const mapping = this.mappings.get(normalizedId);
    
    if (!mapping) {
      return false;
    }
    
    const value = process.env[mapping.envVar];
    return isNonEmptyString(value);
  }

  getSecretInfo(secretId: string): SecretInfo | undefined {
    const normalizedId = secretId.trim();
    const mapping = this.mappings.get(normalizedId);
    
    if (!mapping) {
      return undefined;
    }
    
    return Object.freeze({
      secretId: mapping.secretId,
      available: this.isSecretAvailable(normalizedId),
      description: mapping.description
    });
  }

  getSecretValue(secretId: string): string | undefined {
    const normalizedId = secretId.trim();
    const mapping = this.mappings.get(normalizedId);
    
    if (!mapping) {
      return undefined;
    }
    
    const value = process.env[mapping.envVar];
    return isNonEmptyString(value) ? value : undefined;
  }
}
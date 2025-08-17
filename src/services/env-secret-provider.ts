import { SecretProvider } from '../interfaces/secret-provider.interface.js';
import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';

export class EnvSecretProvider implements SecretProvider {
  private mappings: Map<string, SecretMapping>;

  constructor(mappings: SecretMapping[]) {
    this.mappings = new Map();
    this.loadMappings(mappings);
  }

  private loadMappings(mappings: SecretMapping[]): void {
    for (const mapping of mappings) {
      this.validateMapping(mapping);
      this.mappings.set(mapping.secretId, mapping);
    }
  }

  private validateMapping(mapping: SecretMapping): void {
    if (!mapping.secretId) {
      throw new Error(TEXT.VALIDATION_REQUIRED_FIELD);
    }
    if (!mapping.envVar) {
      throw new Error(TEXT.VALIDATION_REQUIRED_FIELD);
    }
    if (mapping.secretId.length > CONFIG.MAX_SECRET_ID_LENGTH) {
      throw new Error(TEXT.VALIDATION_INVALID_FORMAT);
    }
  }

  getSecretValue(secretId: string): string | undefined {
    const mapping = this.mappings.get(secretId);
    if (!mapping) {
      return undefined;
    }
    
    const value = process.env[mapping.envVar];
    return value;
  }

  isSecretAvailable(secretId: string): boolean {
    const mapping = this.mappings.get(secretId);
    if (!mapping) {
      return false;
    }
    
    const value = process.env[mapping.envVar];
    return value !== undefined && value !== '';
  }

  listAvailableSecrets(): string[] {
    const available: string[] = [];
    
    for (const [secretId] of this.mappings) {
      if (this.isSecretAvailable(secretId)) {
        available.push(secretId);
      }
    }
    
    return available.sort();
  }

  getSecretMapping(secretId: string): SecretMapping | undefined {
    return this.mappings.get(secretId);
  }
}
import { SecretMapping } from './secret-mapping.interface.js';

export interface SecretProvider {
  getSecretValue(secretId: string): string | undefined;
  isSecretAvailable(secretId: string): boolean;
  listAvailableSecrets(): string[];
  getSecretMapping(secretId: string): SecretMapping | undefined;
}
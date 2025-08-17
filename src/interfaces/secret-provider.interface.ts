export interface SecretInfo {
  readonly secretId: string;
  readonly available: boolean;
  readonly description?: string;
}

export interface SecretProvider {
  listSecretIds(): readonly string[];
  isSecretAvailable(secretId: string): boolean;
  getSecretInfo(secretId: string): SecretInfo | undefined;
}
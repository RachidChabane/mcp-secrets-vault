export interface SecretAccessor {
  getSecretValue(secretId: string): string | undefined;
}
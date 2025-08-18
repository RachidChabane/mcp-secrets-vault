
export interface AuditEntry {
  timestamp: string;
  secretId: string;
  action: string;
  outcome: 'success' | 'denied' | 'error';
  reason: string;
  domain?: string;
  method?: string;
}

export interface AuditQueryOptions {
  secretId?: string;
  startTime?: string;
  endTime?: string;
  outcome?: AuditEntry['outcome'];
  page?: number;
  pageSize?: number;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AuditWriter {
  write(entry: AuditEntry): Promise<void>;
  rotate(): Promise<void>;
}

export interface AuditReader {
  query(options?: AuditQueryOptions): Promise<AuditQueryResult>;
  cleanup(maxAgeMs: number): Promise<void>;
}

export interface AuditService extends AuditWriter, AuditReader {
  initialize(): Promise<void>;
  close(): Promise<void>;
}

export interface AuditFileInfo {
  path: string;
  size: number;
  createdAt: Date;
  lineCount: number;
}

export type AuditRotationStrategy = {
  maxSizeMB: number;
  maxAgeDays: number;
};
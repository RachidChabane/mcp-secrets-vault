import { promises as fs } from 'fs';
import * as path from 'path';
import { CONFIG } from '../constants/config-constants.js';
import type { 
  AuditEntry, 
  AuditQueryOptions, 
  AuditQueryResult, 
  AuditService,
  AuditFileInfo,
  AuditRotationStrategy
} from '../interfaces/audit.interface.js';

export class JsonlAuditService implements AuditService {
  private readonly auditDir: string;
  private readonly rotationStrategy: AuditRotationStrategy;
  private currentFile: string | null = null;
  private isInitialized = false;

  constructor(
    auditDir: string = CONFIG.DEFAULT_AUDIT_DIR,
    rotationStrategy?: Partial<AuditRotationStrategy>
  ) {
    this.auditDir = auditDir;
    this.rotationStrategy = {
      maxSizeMB: rotationStrategy?.maxSizeMB ?? CONFIG.AUDIT_MAX_FILE_SIZE_MB,
      maxAgeDays: rotationStrategy?.maxAgeDays ?? CONFIG.AUDIT_MAX_FILE_AGE_DAYS
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    await fs.mkdir(this.auditDir, { recursive: true });
    this.currentFile = await this.getCurrentFile();
    this.isInitialized = true;
  }

  async write(entry: AuditEntry): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const shouldRotate = await this.shouldRotate();
    if (shouldRotate) {
      await this.rotate();
    }

    // Ensure we only write allowed fields
    const sanitizedEntry: AuditEntry = {
      timestamp: entry.timestamp,
      secretId: entry.secretId,
      action: entry.action,
      outcome: entry.outcome,
      reason: entry.reason
    };
    
    if (entry.domain) {
      sanitizedEntry.domain = entry.domain;
    }
    
    if (entry.method) {
      sanitizedEntry.method = entry.method;
    }

    const line = JSON.stringify(sanitizedEntry) + '\n';
    const filePath = await this.getCurrentFile();
    
    await fs.appendFile(filePath, line, CONFIG.DEFAULT_ENCODING);
  }

  async rotate(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newFileName = `${CONFIG.AUDIT_FILE_PREFIX}-${timestamp}${CONFIG.AUDIT_FILE_EXTENSION}`;
    this.currentFile = path.join(this.auditDir, newFileName);
  }

  async query(options?: AuditQueryOptions): Promise<AuditQueryResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const allEntries = await this.collectAllEntries(options);
    const filteredEntries = this.filterEntries(allEntries, options);
    const sortedEntries = this.sortEntries(filteredEntries);
    
    const pagination = this.normalizePagination(options);
    const paginatedEntries = this.paginate(sortedEntries, pagination);

    return {
      entries: paginatedEntries,
      totalCount: sortedEntries.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
      hasMore: pagination.endIndex < sortedEntries.length
    };
  }

  async cleanup(maxAgeMs: number): Promise<void> {
    const files = await this.getAuditFiles();
    const cutoffTime = Date.now() - maxAgeMs;
    const activeFile = await this.getCurrentFile();

    for (const file of files) {
      // Never delete the active audit file
      if (file.path === activeFile) {
        continue;
      }
      
      if (file.createdAt.getTime() < cutoffTime) {
        await fs.unlink(file.path);
      }
    }
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    this.currentFile = null;
  }

  private async handleFileRotation(latestFile: any): Promise<void> {
    const shouldRotate = await this.shouldRotateFile(latestFile);
    if (!shouldRotate) {
      this.currentFile = latestFile.path;
    } else {
      await this.rotate();
    }
  }

  private async getCurrentFile(): Promise<string> {
    if (!this.currentFile) {
      const files = await this.getAuditFiles();
      if (files.length > 0 && files[0]) {
        await this.handleFileRotation(files[0]);
      } else {
        await this.rotate();
      }
    }
    return this.currentFile!;
  }

  private async shouldRotate(): Promise<boolean> {
    if (!this.currentFile) return true;
    
    try {
      const stats = await fs.stat(this.currentFile);
      const info: AuditFileInfo = {
        path: this.currentFile,
        size: stats.size,
        createdAt: stats.birthtime,
        lineCount: 0
      };
      
      return this.shouldRotateFile(info);
    } catch {
      return true;
    }
  }

  private async collectAllEntries(options?: AuditQueryOptions): Promise<AuditEntry[]> {
    const files = await this.getAuditFiles();
    const allEntries: AuditEntry[] = [];

    for (const file of files) {
      const entries = await this.readEntries(file.path, options);
      allEntries.push(...entries);
    }

    return allEntries;
  }

  private normalizePagination(options?: AuditQueryOptions) {
    const rawPage = options?.page ?? CONFIG.DEFAULT_PAGE_NUMBER;
    const page = Math.max(rawPage, CONFIG.DEFAULT_PAGE_NUMBER);
    
    const rawPageSize = options?.pageSize ?? CONFIG.DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(
      Math.max(rawPageSize, CONFIG.DEFAULT_PAGE_NUMBER),
      CONFIG.AUDIT_MAX_PAGE_SIZE
    );
    
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    return { page, pageSize, startIndex, endIndex };
  }

  private paginate(entries: AuditEntry[], pagination: ReturnType<typeof this.normalizePagination>): AuditEntry[] {
    return entries.slice(pagination.startIndex, pagination.endIndex);
  }

  private shouldRotateFile(file: AuditFileInfo): boolean {
    const sizeMB = file.size / CONFIG.BYTES_PER_MB;
    const ageMs = Date.now() - file.createdAt.getTime();
    const ageDays = ageMs / CONFIG.MS_PER_DAY;
    
    return sizeMB >= this.rotationStrategy.maxSizeMB || 
           ageDays >= this.rotationStrategy.maxAgeDays;
  }

  private async getAuditFiles(): Promise<AuditFileInfo[]> {
    try {
      const entries = await fs.readdir(this.auditDir);
      const validEntries = entries.filter(entry => this.isAuditFile(entry));
      const files = await Promise.all(
        validEntries.map(entry => this.createFileInfo(entry))
      );
      
      return files.sort((a, b) => 
        b.createdAt.getTime() - a.createdAt.getTime()
      );
    } catch (error: any) {
      if (error.code === CONFIG.FS_ERROR_ENOENT) {
        return [];
      }
      throw error;
    }
  }

  private isAuditFile(entry: string): boolean {
    return entry.startsWith(CONFIG.AUDIT_FILE_PREFIX) &&
           entry.endsWith(CONFIG.AUDIT_FILE_EXTENSION);
  }

  private async createFileInfo(entry: string): Promise<AuditFileInfo> {
    const filePath = path.join(this.auditDir, entry);
    const stats = await fs.stat(filePath);
    
    return {
      path: filePath,
      size: stats.size,
      createdAt: stats.birthtime,
      lineCount: CONFIG.ZERO_COUNT
    };
  }

  private parseAuditLine(line: string, options?: AuditQueryOptions): AuditEntry | null {
    try {
      const entry = JSON.parse(line) as AuditEntry;
      return this.matchesTimeRange(entry, options) ? entry : null;
    } catch {
      return null;
    }
  }

  private async readEntries(
    filePath: string, 
    options?: AuditQueryOptions
  ): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(filePath, CONFIG.DEFAULT_ENCODING);
      const lines = content.split(CONFIG.LINE_ENDING_PATTERN).filter(line => line.trim());
      return lines
        .map(line => this.parseAuditLine(line, options))
        .filter((entry): entry is AuditEntry => entry !== null);
    } catch {
      return [];
    }
  }

  private matchesTimeRange(
    entry: AuditEntry, 
    options?: AuditQueryOptions
  ): boolean {
    if (!options?.startTime && !options?.endTime) return true;
    
    const entryTime = new Date(entry.timestamp).getTime();
    
    if (options.startTime) {
      const startTime = new Date(options.startTime).getTime();
      if (entryTime < startTime) return false;
    }
    
    if (options.endTime) {
      const endTime = new Date(options.endTime).getTime();
      if (entryTime > endTime) return false;
    }
    
    return true;
  }

  private filterEntries(
    entries: AuditEntry[], 
    options?: AuditQueryOptions
  ): AuditEntry[] {
    if (!options) return entries;
    
    return entries.filter(entry => {
      if (options.secretId && entry.secretId !== options.secretId) {
        return false;
      }
      
      if (options.outcome && entry.outcome !== options.outcome) {
        return false;
      }
      
      return true;
    });
  }

  private sortEntries(entries: AuditEntry[]): AuditEntry[] {
    return entries.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }
}
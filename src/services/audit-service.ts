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

    const files = await this.getAuditFiles();
    const allEntries: AuditEntry[] = [];

    for (const file of files) {
      const entries = await this.readEntries(file.path, options);
      allEntries.push(...entries);
    }

    const filteredEntries = this.filterEntries(allEntries, options);
    const sortedEntries = this.sortEntries(filteredEntries);
    
    const page = options?.page ?? CONFIG.DEFAULT_PAGE_NUMBER;
    const pageSize = Math.min(
      options?.pageSize ?? CONFIG.DEFAULT_PAGE_SIZE,
      CONFIG.AUDIT_MAX_PAGE_SIZE
    );
    
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedEntries = sortedEntries.slice(startIndex, endIndex);

    return {
      entries: paginatedEntries,
      totalCount: sortedEntries.length,
      page,
      pageSize,
      hasMore: endIndex < sortedEntries.length
    };
  }

  async cleanup(maxAgeMs: number): Promise<void> {
    const files = await this.getAuditFiles();
    const cutoffTime = Date.now() - maxAgeMs;

    for (const file of files) {
      if (file.createdAt.getTime() < cutoffTime) {
        await fs.unlink(file.path);
      }
    }
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    this.currentFile = null;
  }

  private async getCurrentFile(): Promise<string> {
    if (!this.currentFile) {
      const files = await this.getAuditFiles();
      
      if (files.length > 0) {
        const latestFile = files[0];
        if (latestFile) {
          const shouldRotate = await this.shouldRotateFile(latestFile);
          
          if (!shouldRotate) {
            this.currentFile = latestFile.path;
          } else {
            await this.rotate();
          }
        } else {
          await this.rotate();
        }
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

  private shouldRotateFile(file: AuditFileInfo): boolean {
    const sizeMB = file.size / (1024 * 1024);
    const ageMs = Date.now() - file.createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    return sizeMB >= this.rotationStrategy.maxSizeMB || 
           ageDays >= this.rotationStrategy.maxAgeDays;
  }

  private async getAuditFiles(): Promise<AuditFileInfo[]> {
    try {
      const entries = await fs.readdir(this.auditDir);
      const files: AuditFileInfo[] = [];
      
      for (const entry of entries) {
        if (!entry.startsWith(CONFIG.AUDIT_FILE_PREFIX)) continue;
        if (!entry.endsWith(CONFIG.AUDIT_FILE_EXTENSION)) continue;
        
        const filePath = path.join(this.auditDir, entry);
        const stats = await fs.stat(filePath);
        
        files.push({
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime,
          lineCount: 0
        });
      }
      
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

  private async readEntries(
    filePath: string, 
    options?: AuditQueryOptions
  ): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(filePath, CONFIG.DEFAULT_ENCODING);
      const lines = content.split('\n').filter(line => line.trim());
      const entries: AuditEntry[] = [];
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          
          if (this.matchesTimeRange(entry, options)) {
            entries.push(entry);
          }
        } catch {
          continue;
        }
      }
      
      return entries;
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
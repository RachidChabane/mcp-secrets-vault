interface LogContext {
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  [key: string]: unknown;
}

export function writeError(message: string, context: LogContext = {}): void {
  const { level = 'ERROR', ...rest } = context;
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...rest
  };
  
  // Write to stderr as structured JSON
  console.error(JSON.stringify(logEntry));
}
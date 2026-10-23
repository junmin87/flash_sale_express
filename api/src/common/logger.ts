// Shared logger. info goes to stdout, error goes to stderr

type LogLevel = 'info' | 'error';

// Single logging entry point for the whole API
export function log(level: LogLevel, message: string): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`;
  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

// [KO] 공통 로거. info는 stdout, error는 stderr로 출력

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

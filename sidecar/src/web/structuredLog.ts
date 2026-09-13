export type LogFields = Record<string, string | number | boolean | null | undefined>;

/**
 * One JSON object per line. Callers pass fixed event names and non-personal fields only: never
 * activation codes, secrets, tokens, email addresses, TikTok names or chat content.
 */
export type StructuredLogger = (level: 'info' | 'warn' | 'error', event: string, fields?: LogFields) => void;

export function createJsonLogger(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): StructuredLogger {
  return (level, event, fields = {}) => {
    const entry: Record<string, unknown> = { time: new Date().toISOString(), level, event };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) entry[key] = value;
    }
    write(JSON.stringify(entry));
  };
}

export const silentLogger: StructuredLogger = () => undefined;

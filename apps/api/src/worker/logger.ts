export type LogFields = Record<string, unknown>;

/** Structured logger: one JSON object per line. Callers never pass document text or secrets. */
export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

type Level = 'info' | 'warn' | 'error';

function serialize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value instanceof Error ? { name: value.name, message: value.message } : value;
  }
  return out;
}

export function createLogger(
  bindings: LogFields = {},
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const log = (level: Level, message: string, fields: LogFields = {}) =>
    write(
      JSON.stringify({
        level,
        time: new Date().toISOString(),
        msg: message,
        ...serialize(bindings),
        ...serialize(fields),
      }),
    );
  return {
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
    child: (more) => createLogger({ ...bindings, ...more }, write),
  };
}

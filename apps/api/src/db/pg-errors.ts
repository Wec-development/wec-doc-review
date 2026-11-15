/** The fields of a node-postgres DatabaseError that callers branch on. */
export interface PgError {
  code: string;
  constraint?: string;
}

const UNIQUE_VIOLATION = '23505';

function isPgError(error: unknown): error is PgError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/** Drizzle wraps driver errors; walk the cause chain to the Postgres error. */
export function findPgError(error: unknown): PgError | undefined {
  let current: unknown = error;
  while (current instanceof Error || isPgError(current)) {
    if (isPgError(current)) {
      return current;
    }
    current = current.cause;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = findPgError(error);
  return pgError?.code === UNIQUE_VIOLATION && pgError.constraint === constraint;
}

import { type DocumentType, EXPECTED_FIELDS } from '@doc-review/shared';

/**
 * Orders values by the field order in the shared field definitions; fields the definitions do not
 * know (should not happen) go last, alphabetically.
 */
export function orderByFieldDefinitions<T extends { field: string }>(
  type: DocumentType,
  values: readonly T[],
): T[] {
  const position = new Map(
    EXPECTED_FIELDS[type].map((definition, index) => [definition.field, index]),
  );
  const rank = (field: string) => position.get(field) ?? Number.MAX_SAFE_INTEGER;
  return [...values].sort(
    (a, b) => rank(a.field) - rank(b.field) || a.field.localeCompare(b.field),
  );
}

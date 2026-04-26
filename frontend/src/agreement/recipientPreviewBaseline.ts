/**
 * Preserves a deep snapshot of the owner draft for recipient preview; does not
 * touch the source draft in memory (deep clone).
 */
export function cloneDraftForRecipientPreview<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

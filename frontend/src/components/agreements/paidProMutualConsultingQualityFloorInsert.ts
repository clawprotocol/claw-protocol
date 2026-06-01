/** Shared insert-before-signature helper for quality floors. */
export function insertBeforeExecutionTail(text: string, insertion: string): string {
  const marker = text.search(/\n\s*IN WITNESS WHEREOF\b/i);
  if (marker < 0) return `${text.trimEnd()}\n\n${insertion.trim()}`.trim();
  return `${text.slice(0, marker).trimEnd()}\n\n${insertion.trim()}\n\n${text.slice(marker).trimStart()}`.trim();
}

import type { Vs01PageTextLayout } from "./vs01PageTextLayout";

const cache = new Map<string, Vs01PageTextLayout[]>();

export function setVs01DocumentPageLayouts(documentId: string, layouts: Vs01PageTextLayout[]): void {
  const id = documentId.trim();
  if (!id) return;
  cache.set(id, layouts);
}

export function getVs01DocumentPageLayouts(documentId: string | null | undefined): Vs01PageTextLayout[] | null {
  const id = (documentId ?? "").trim();
  if (!id) return null;
  return cache.get(id) ?? null;
}

export function clearVs01DocumentPageLayouts(documentId?: string): void {
  if (documentId?.trim()) {
    cache.delete(documentId.trim());
    return;
  }
  cache.clear();
}

/** Test-only */
export function __resetVs01DocumentLayoutCacheForTests(): void {
  cache.clear();
}

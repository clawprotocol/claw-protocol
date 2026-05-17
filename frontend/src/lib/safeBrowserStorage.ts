/**
 * Best-effort browser storage — never throws into UI; logs compact diagnostics only.
 */

export type StorageSurface = "localStorage" | "sessionStorage";

export const AGREEMENT_VERSIONS_KEY_PREFIX = "claw_agreement_versions_v1:";
export const DEFAULT_MAX_STORAGE_BYTES = 250_000;
export const DEFAULT_AGREEMENT_VERSION_CACHE_KEEP = 10;

export function isQuotaExceededError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return (
      err.name === "QuotaExceededError" ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /quota/i.test(msg) || /exceeded the quota/i.test(msg);
}

export function isStorageSecurityError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "SecurityError";
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /securityerror|access is denied|sandbox/i.test(msg);
}

export function approxUtf8Bytes(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return value.length * 2;
}

export function storageKeyPrefixForLog(key: string): string {
  const k = (key || "").trim();
  if (!k) return "";
  const parts = k.split(":");
  if (parts.length >= 3 && parts[0] === "claw_agreement_versions_v1") {
    return `${parts[0]}:${parts[1]}:`;
  }
  const idx = k.indexOf(":");
  return idx > 0 ? `${k.slice(0, idx + 1)}` : k.slice(0, 48);
}

function logWriteSkipped(payload: {
  keyPrefix: string;
  reason: string;
  approxBytes: number;
  surface: StorageSurface;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[safe-storage-write-skipped]", payload);
}

export type SafeStorageSetOptions = {
  surface?: StorageSurface;
  maxBytes?: number;
  /** When quota is hit, prune keys with this prefix (e.g. claw_agreement_versions_v1:). */
  prunePrefixOnQuota?: string;
  pruneKeep?: number;
  /** Never delete this key during prune (the write we are attempting). */
  retainKey?: string;
};

/**
 * Write to storage without throwing. Returns true when the value was stored.
 */
export function safeStorageSetItem(
  storage: Storage,
  key: string,
  value: string,
  options?: SafeStorageSetOptions,
): boolean {
  const surface: StorageSurface = options?.surface ?? "localStorage";
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_STORAGE_BYTES;
  const keyPrefix = storageKeyPrefixForLog(key);
  const approxBytes = approxUtf8Bytes(value);

  if (approxBytes > maxBytes) {
    logWriteSkipped({ keyPrefix, reason: "payload_over_max_bytes", approxBytes, surface });
    return false;
  }

  const attempt = (): boolean => {
    try {
      storage.setItem(key, value);
      return true;
    } catch (err: unknown) {
      if (isQuotaExceededError(err)) {
        const prunePrefix = options?.prunePrefixOnQuota;
        if (prunePrefix) {
          const removed = pruneStorageKeysWithPrefix(storage, prunePrefix, {
            keep: options?.pruneKeep ?? DEFAULT_AGREEMENT_VERSION_CACHE_KEEP,
            retainKey: options?.retainKey ?? key,
          });
          if (removed > 0 && import.meta.env.MODE !== "test") {
            // eslint-disable-next-line no-console
            console.info("[reviewer-local-cache-pruned]", {
              removed,
              keep: options?.pruneKeep ?? DEFAULT_AGREEMENT_VERSION_CACHE_KEEP,
              prefix: prunePrefix,
            });
          }
          if (removed > 0) {
            try {
              storage.setItem(key, value);
              return true;
            } catch (retryErr: unknown) {
              if (!isQuotaExceededError(retryErr) && !isStorageSecurityError(retryErr)) {
                logWriteSkipped({
                  keyPrefix,
                  reason: `retry_${retryErr instanceof Error ? retryErr.name : "error"}`,
                  approxBytes,
                  surface,
                });
              }
            }
          }
        }
        logWriteSkipped({ keyPrefix, reason: "quota_exceeded", approxBytes, surface });
        return false;
      }
      if (isStorageSecurityError(err)) {
        logWriteSkipped({ keyPrefix, reason: "security_error", approxBytes, surface });
        return false;
      }
      logWriteSkipped({
        keyPrefix,
        reason: err instanceof Error ? err.name : "unknown",
        approxBytes,
        surface,
      });
      return false;
    }
  };

  return attempt();
}

export function safeStorageGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageRemoveItem(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

type PruneOptions = {
  keep: number;
  retainKey?: string;
};

/**
 * Remove oldest agreement version cache entries for a prefix. Returns count removed.
 * Only touches keys starting with ``prefix``; never unrelated app keys.
 */
export function pruneStorageKeysWithPrefix(
  storage: Storage,
  prefix: string,
  options: PruneOptions,
): number {
  if (typeof window === "undefined") return 0;
  const keep = Math.max(1, options.keep);
  const retainKey = (options.retainKey || "").trim();
  const entries: { key: string; sortKey: number }[] = [];

  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      if (retainKey && key === retainKey) continue;
      let sortKey = 0;
      try {
        const raw = storage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as { _cacheUpdatedAt?: string; versions?: { created_at?: string }[] };
          const at =
            parsed._cacheUpdatedAt ||
            parsed.versions?.[parsed.versions.length - 1]?.created_at ||
            "";
          sortKey = at ? Date.parse(at) || 0 : 0;
        }
      } catch {
        sortKey = 0;
      }
      entries.push({ key, sortKey });
    }
  } catch {
    return 0;
  }

  entries.sort((a, b) => a.sortKey - b.sortKey);
  const toRemove = entries.slice(0, Math.max(0, entries.length - keep + 1));
  let removed = 0;
  for (const { key } of toRemove) {
    if (retainKey && key === retainKey) continue;
    safeStorageRemoveItem(storage, key);
    removed += 1;
  }
  return removed;
}

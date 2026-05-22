/**
 * Track authoritative guided-apply version + body fingerprint vs signing packet prep.
 */

const PACKET_SNAP_KEY = "claw_guided_signing_packet_snap_v1";
/** @deprecated legacy version-only key */
const PACKET_VERSION_KEY = "claw_guided_signing_packet_version_v1";

export type GuidedPacketPrepSnapshot = {
  versionId: string;
  bodyHash: string;
  preparedAt: number;
};

let memoryPacketSnap: GuidedPacketPrepSnapshot | null = null;

export function fingerprintAgreementBody(text: string): string {
  const t = (text || "").trim();
  if (!t) return "empty";
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${t.length}:${(h >>> 0).toString(16)}`;
}

function readSnapRaw(): GuidedPacketPrepSnapshot | null {
  try {
    const raw = sessionStorage.getItem(PACKET_SNAP_KEY);
    if (raw) {
      const o = JSON.parse(raw) as GuidedPacketPrepSnapshot;
      if (o?.versionId && o?.bodyHash) return o;
    }
  } catch {
    /* ignore */
  }
  if (memoryPacketSnap) return memoryPacketSnap;
  const legacy = readSigningPacketGuidedVersionLegacy();
  if (legacy) {
    return { versionId: legacy, bodyHash: "", preparedAt: Date.now() };
  }
  return null;
}

function readSigningPacketGuidedVersionLegacy(): string | null {
  try {
    return sessionStorage.getItem(PACKET_VERSION_KEY);
  } catch {
    return null;
  }
}

export function readSigningPacketPrepSnapshot(): GuidedPacketPrepSnapshot | null {
  return readSnapRaw();
}

export function readSigningPacketGuidedVersion(): string | null {
  return readSnapRaw()?.versionId ?? null;
}

export function markSigningPacketPreparedAtGuidedVersion(
  versionId: string,
  bodyHash?: string | null,
): void {
  const id = versionId.trim();
  if (!id) return;
  const snap: GuidedPacketPrepSnapshot = {
    versionId: id,
    bodyHash: (bodyHash || "").trim(),
    preparedAt: Date.now(),
  };
  memoryPacketSnap = snap;
  try {
    sessionStorage.setItem(PACKET_SNAP_KEY, JSON.stringify(snap));
    sessionStorage.setItem(PACKET_VERSION_KEY, id);
  } catch {
    /* ignore */
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[guided-finalized-ready-for-signature]", {
      versionIdShort: id.slice(0, 8),
      bodyHashShort: snap.bodyHash.slice(0, 12) || null,
    });
  }
}

export function invalidateSigningPacketPrep(reason: string): void {
  memoryPacketSnap = null;
  try {
    sessionStorage.removeItem(PACKET_SNAP_KEY);
    sessionStorage.removeItem(PACKET_VERSION_KEY);
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.warn("[guided-packet-invalidated]", { reason });
}

export type GuidedPacketStaleResult = {
  stale: boolean;
  reason: string | null;
  preparedVersion: string | null;
  currentVersion: string | null;
};

export function resolveSigningPacketStale(args: {
  currentVersionId: string | null;
  currentBodyHash: string | null;
}): GuidedPacketStaleResult {
  const prepared = readSnapRaw();
  const currentVersion = (args.currentVersionId || "").trim();
  const currentBodyHash = (args.currentBodyHash || "").trim();
  if (!prepared?.versionId) {
    return { stale: false, reason: null, preparedVersion: null, currentVersion: currentVersion || null };
  }
  if (!currentVersion) {
    return {
      stale: false,
      reason: null,
      preparedVersion: prepared.versionId,
      currentVersion: null,
    };
  }
  if (prepared.versionId !== currentVersion) {
    logGuidedPacketVersionMismatch({
      preparedVersion: prepared.versionId,
      currentVersion,
    });
    return {
      stale: true,
      reason: "version_mismatch",
      preparedVersion: prepared.versionId,
      currentVersion,
    };
  }
  if (prepared.bodyHash && currentBodyHash && prepared.bodyHash !== currentBodyHash) {
    return {
      stale: true,
      reason: "body_hash_mismatch",
      preparedVersion: prepared.versionId,
      currentVersion,
    };
  }
  return {
    stale: false,
    reason: null,
    preparedVersion: prepared.versionId,
    currentVersion,
  };
}

/** @deprecated Use resolveSigningPacketStale */
export function isSigningPacketStaleForGuidedVersion(currentGuidedVersionId: string | null): boolean {
  return resolveSigningPacketStale({
    currentVersionId: currentGuidedVersionId,
    currentBodyHash: null,
  }).stale;
}

export function logGuidedPacketVersionMismatch(args: {
  preparedVersion: string | null;
  currentVersion: string | null;
}): void {
  // eslint-disable-next-line no-console
  console.warn("[guided-packet-version-mismatch]", args);
}

export function logGuidedPacketInvalidated(args: {
  preparedVersion?: string | null;
  currentVersion?: string | null;
  reason?: string;
}): void {
  // eslint-disable-next-line no-console
  console.warn("[guided-packet-invalidated]", args);
}

export function logGuidedPacketStaleHardStop(reason: string): void {
  // eslint-disable-next-line no-console
  console.warn("[guided-packet-stale-hard-stop]", { reason, sendBlocked: true });
}

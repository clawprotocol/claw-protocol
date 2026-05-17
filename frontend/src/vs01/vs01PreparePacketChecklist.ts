import type { SigningPacketPrepareGate, Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { formatPrepareMissingFieldLabel } from "./vs01PreparePacketCompletion";

export type PreparePacketChecklistView = {
  readyCount: number;
  totalCount: number;
  allReady: boolean;
  headline: string;
  activeSignerHint: string | null;
};

export function buildPreparePacketChecklistView(
  gate: SigningPacketPrepareGate | null,
  roles: Vs01PrepareSigningRole[],
  activeRoleId: string | null,
): PreparePacketChecklistView {
  const required = roles.filter((r) => r.requiresSignature);
  const totalCount = required.length;
  if (!gate || totalCount === 0) {
    return {
      readyCount: 0,
      totalCount,
      allReady: false,
      headline: "Packet checklist",
      activeSignerHint: "Signer roles are loading…",
    };
  }
  const readyCount = required.filter((r) => !(gate.missingByParty[r.roleId]?.length ?? 0)).length;
  const allReady = gate.canFinish;
  const headline = allReady
    ? "Packet ready."
    : `Completed: ${readyCount} / ${totalCount} signers ready`;

  let activeSignerHint: string | null = null;
  if (!allReady && activeRoleId) {
    const active = required.find((r) => r.roleId === activeRoleId);
    const miss = active ? (gate.missingByParty[active.roleId] ?? []) : [];
    if (active && miss.length) {
      const labels = miss.map(formatPrepareMissingFieldLabel).join(", ");
      const party = active.entityName?.trim() || active.partyName?.trim() || "this signer";
      activeSignerHint = `For ${party}: add ${labels}.`;
    }
  }

  return {
    readyCount,
    totalCount,
    allReady,
    headline,
    activeSignerHint,
  };
}

export function logVs01PrepareContinueBlocked(payload: {
  incompleteSignerCount: number;
  focusRoleIdShort: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-continue-blocked]", payload);
}

export function logVs01PrepareContinueAllowed(payload: {
  agreementIdShort: string;
  signerCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-continue-allowed]", payload);
}

/** Dev-only: allow repeat placement when Shift held or localStorage flag set. */
export function vs01DevKeepPlacingEnabled(): boolean {
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return false;
  try {
    return localStorage.getItem("vs01_dev_keep_placing") === "1";
  } catch {
    return false;
  }
}

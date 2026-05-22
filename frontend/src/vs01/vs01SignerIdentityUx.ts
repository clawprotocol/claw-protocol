/**
 * Progressive signer identity copy — avoid false "missing signer" anxiety when email exists.
 */

import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { isKnownPrepareSignerName } from "./vs01PrepareSignerDisplay";
import { isPlausibleEmail } from "./detailsStepValidation";

export function formatEmailLocalPartAsSignerName(email: string): string {
  const em = email.trim();
  const at = em.indexOf("@");
  if (at < 1) return "";
  const local = em.slice(0, at).replace(/[._+-]+/g, " ").trim();
  if (!local) return "";
  return local
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function resolvePrepareSignerMetadataPanelTitle(role: Vs01PrepareSigningRole): {
  title: string;
  hint: string | null;
  severity: "ok" | "optional" | "required";
} {
  const known = isKnownPrepareSignerName(role);
  const email = (role.signerEmail || "").trim();
  const party = (role.partyName || role.entityName || "").trim();
  const hasEmail = isPlausibleEmail(email);
  const hasParty = party.length > 0;

  if (known) {
    return { title: "Signer details", hint: null, severity: "ok" };
  }
  if (hasEmail) {
    return {
      title: "Signer details optional",
      hint: "Signer will confirm their name when they open the signing link. You can add a representative name now if you want it on the packet.",
      severity: "optional",
    };
  }
  if (hasParty) {
    return {
      title: "Signature label can be customized",
      hint: "Add a representative name for the signing block, or leave it for the signer to provide.",
      severity: "optional",
    };
  }
  return {
    title: "Signer information needed",
    hint: "Add a signer email or party name so LawDog can prepare the signing packet.",
    severity: "required",
  };
}

export function inferSignerDisplayNameFromRole(role: Vs01PrepareSigningRole): string {
  const known = (role.signerName ?? "").trim();
  if (known) return known;
  const email = (role.signerEmail || "").trim();
  if (isPlausibleEmail(email)) return formatEmailLocalPartAsSignerName(email);
  return "";
}

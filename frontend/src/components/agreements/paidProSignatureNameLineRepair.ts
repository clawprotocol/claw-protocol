import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import { resolvePartyIndexForSignatureLine } from "./guidedDealCompletion/signerPartyIdentity";

/** Never show a party legal entity in a signature Name: line when human signer name is available. */
export function repairSignatureNameLinesUsingLegalEntity(
  corpus: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; repairs: number } {
  const legalLower = identities
    .map((id) => id.partyDisplayName.trim().toLowerCase())
    .filter((n) => n.length >= 2);
  if (!legalLower.length) return { text: corpus, repairs: 0 };

  const lines = (corpus || "").replace(/\r\n/g, "\n").split("\n");
  let repairs = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(/^(\s*)Name:\s*(.+)$/i);
    if (!match) continue;
    const value = match[2].trim();
    if (!value || /_{4,}/.test(value)) continue;
    const valueLower = value.toLowerCase();
    const isLegalEntityValue = legalLower.some(
      (legal) => valueLower === legal || (legal.length >= 8 && valueLower.includes(legal)),
    );
    if (!isLegalEntityValue) continue;

    const partyIndex = resolvePartyIndexForSignatureLine(lines, i, identities);
    const signerName = identities[partyIndex]?.representativeName?.trim() ?? "";
    const indent = match[1] ?? "";
    if (signerName && !legalLower.includes(signerName.toLowerCase())) {
      lines[i] = `${indent}Name: ${signerName}`;
    } else {
      lines[i] = `${indent}Name: __________________________`;
    }
    repairs += 1;
  }

  return { text: lines.join("\n"), repairs };
}

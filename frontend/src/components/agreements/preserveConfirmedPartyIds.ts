import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";

type NamedParty = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  email?: string | null;
  signerName?: string | null;
  signer_name?: string | null;
  signerTitle?: string | null;
};

export type PreservedPartyPayload = {
  id?: string;
  name: string;
  role?: string | null;
  email?: string;
  signerName?: string;
  signerTitle?: string;
};

/** Keep confirmed participant ids when posting parties so approvals and tokens stay bound. */
export function partiesPayloadPreservingIds(
  parties: readonly NamedParty[],
  existing: readonly NamedParty[] = [],
): PreservedPartyPayload[] {
  const used = new Set<string>();
  return parties
    .filter((party) => {
      const name = String(party.name || "").trim();
      return Boolean(name) && !/^\d+\s+/.test(name);
    })
    .map((party) => {
      const name = String(party.name || "").trim();
      const incomingId = String(party.id || "").trim();
      const matchedId =
        incomingId ||
        String(
          existing.find((row) => {
            const id = String(row.id || "").trim();
            return id && !used.has(id) && partyLegalNamesMatch(String(row.name || ""), name);
          })?.id || "",
        ).trim();
      if (matchedId) used.add(matchedId);
      const signerName = String(party.signerName || party.signer_name || "").trim();
      const signerTitle = String(party.signerTitle || "").trim();
      const email = String(party.email || "").trim();
      return {
        ...(matchedId ? { id: matchedId } : {}),
        name,
        role: party.role,
        ...(email ? { email } : {}),
        ...(signerName ? { signerName } : {}),
        ...(signerTitle ? { signerTitle } : {}),
      };
    });
}

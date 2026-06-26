/**
 * TEST438 — four-party Brand Licensing/Distribution live server corpus defects (~34k).
 */

import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  ATLAS,
  BRIGHT_PEAK,
  EVERGREEN,
  HORIZON,
  TEST437_BRAND_LICENSING_INTAKE,
  test437BrandLicensingDraft,
} from "./paidProTest437BrandLicensingFixtures";

export const TEST438_TARGET_SERVER_LEN = 34_340;
export const TEST438_MIN_ACCEPTED_LEN = 30_000;

export const TEST438_PARTIES = [EVERGREEN, ATLAS, HORIZON, BRIGHT_PEAK] as const;

export const TEST438_PARTY_ADDRESSES: Record<string, string> = {
  [EVERGREEN]: "1200 Summit Ridge Drive, Oklahoma City, OK 73102",
  [ATLAS]: "4550 Industrial Parkway, Tulsa, OK 74103",
  [HORIZON]: "890 Commerce Center Blvd, Dallas, TX 75201",
  [BRIGHT_PEAK]: "220 Market Street, Suite 400, Denver, CO 80202",
};

export const TEST438_PARTY_EMAILS: Record<string, string> = {
  [EVERGREEN]: "notices@evergreenoutdoor.com",
  [ATLAS]: "legal@atlasconsumer.com",
  [HORIZON]: "contracts@horizonwholesale.com",
  [BRIGHT_PEAK]: "notices@brightpeakretail.com",
};

const WEAK_GOVERNING_LAW =
  "This Agreement shall be governed by the laws of the jurisdiction mutually agreed by the parties in writing. If the parties do not separately agree on a governing law jurisdiction, the governing law shall be the laws of the jurisdiction where Brand Owner is organized, without regard to conflict of laws rules.";

const WEAK_VENUE =
  "Any legal action arising out of this Agreement shall be brought exclusively in a court of competent jurisdiction mutually agreed by the parties in writing or, if not agreed, in a court of competent jurisdiction where the defendant party is located.";

function buildGenericNoticeStanzas(parties: readonly string[]): string {
  return parties
    .map((party) =>
      [`If to ${party}:`, party, "Primary business address and email on file with the other Parties."].join("\n"),
    )
    .join("\n\n");
}

function injectSection13CompositeDefects(corpus: string, parties: readonly string[]): string {
  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? corpus.slice(0, witnessIdx) : corpus;
  const tail = witnessIdx >= 0 ? corpus.slice(witnessIdx) : "";

  const section13Block = [
    "13. Assignment, Dispute Resolution, Governing Law and Notices",
    "",
    "13. NOTICES",
    "",
    "13.1 Assignment. No Party may assign this Agreement without the prior written consent of the other Parties, except to an affiliate or successor in a merger or sale of substantially all assets.",
    "",
    "13.2 Dispute Resolution and Venue. " + WEAK_VENUE,
    "",
    "13.3 Governing Law. " + WEAK_GOVERNING_LAW,
    "",
    "13.4 Notices. Any notice under this Agreement must be in writing and delivered by email, nationally recognized courier, personal delivery, or certified or registered mail to the applicable notice address below, or to any updated address designated by notice.",
    "",
    buildGenericNoticeStanzas(parties),
    "",
    "14. Miscellaneous",
    "",
    "14.1 Entire Agreement. This Agreement is the entire agreement among the Parties regarding its subject matter.",
    "",
    "14.2 Amendments. Amendments require written agreement signed by all Parties.",
    "",
    "14.3 Severability. Unenforceable provisions are modified to the minimum extent necessary.",
    "",
    "14.4 Waiver. No waiver operates as a future waiver.",
    "",
    "14.5 Counterparts and Electronic Signatures. This Agreement may be executed in counterparts with electronic signatures.",
    "",
  ].join("\n");

  const strippedHead = head
    .replace(/\n(?:9|10|11|12)\.[\s\S]*$/i, "")
    .trimEnd();

  return `${strippedHead}\n\n${section13Block}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** ~34k server_full_document_text mirroring TEST437/438 live Pro generation polish targets. */
export function buildTest438BrandLicensingLiveServerCorpus(): string {
  const base = buildNPartyPaidProServerCorpus({
    parties: TEST438_PARTIES,
    intakeText: TEST437_BRAND_LICENSING_INTAKE,
    draft: test437BrandLicensingDraft(),
    title: "Services Agreement",
    minLen: 14_000,
  });

  let corpus = injectSection13CompositeDefects(base, TEST438_PARTIES);
  corpus = corpus.replace(/^SERVICES AGREEMENT/m, "SERVICES AGREEMENT");
  return padOperativeCorpusBeforeWitness(corpus, TEST438_TARGET_SERVER_LEN);
}

export function test438DraftWithNoticeContacts() {
  const base = test437BrandLicensingDraft();
  const roleByName = new Map(
    base.parties.map((p) => [String(p.name ?? "").trim(), String(p.role ?? "").trim()]),
  );
  return {
    ...base,
    parties: TEST438_PARTIES.map((name, partyIndex) => ({
      name,
      role: roleByName.get(name) ?? `Party ${partyIndex + 1}`,
      partyAddress: TEST438_PARTY_ADDRESSES[name],
      signerEmail: TEST438_PARTY_EMAILS[name],
    })) as never[],
  };
}

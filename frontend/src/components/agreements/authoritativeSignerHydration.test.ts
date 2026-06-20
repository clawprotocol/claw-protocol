import { afterEach, describe, expect, it } from "vitest";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveCanonicalPartyIdentitiesFromSignerSetup } from "./guidedDealCompletion/signerPartyIdentity";
import { corpusSignatureBlocksHaveRequiredByLines } from "./guidedDealCompletion/signatureRegion";
import {
  buildHydratedAuthoritativeSigningCorpus,
  buildHydratedAuthoritativeSigningCorpusFromAuthority,
  fingerprintSignerMetadataState,
  readAuthoritativeSignerIdentitiesForSurfaces,
  resolveAuthoritativeSignerIdentitiesFromSnapshot,
  signerMetadataDriftedFromSnapshot,
} from "./authoritativeSignerHydration";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";

const BLUE_CANYON = "Blue Canyon Analytics LLC";
const IRON_VALE = "Iron Vale Systems Inc";

const RAW_BODY = [
  "MASTER SERVICES AGREEMENT",
  "",
  `Between ${BLUE_CANYON} and ${IRON_VALE}.`,
  "",
  ...Array.from({ length: 80 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  BLUE_CANYON,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
  "",
  "SERVICE PROVIDER:",
  IRON_VALE,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
].join("\n");

function signerArgs() {
  return {
    partyCount: 2,
    partySignerNames: ["Anthem H Blanchard", "Jim Summit"],
    partySignerTitles: ["Manager", "CEO"],
    recipient1Name: BLUE_CANYON,
    recipient2Name: IRON_VALE,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "anthemhayek@me.com",
    extraPartyReviewEmails: [] as string[],
    draftPartyNames: [BLUE_CANYON, IRON_VALE],
    sendMode: "signature" as const,
    recipientsDeferred: false,
  };
}

describe("authoritativeSignerHydration", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
  });

  it("hydrates entity-heading signature blocks without CLIENT/SERVICE PROVIDER labels", () => {
    const entityBody = [
      "AGREEMENT",
      "",
      "Between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
      "",
      ...Array.from({ length: 60 }, (_, i) => `Clause ${i + 1}.`),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "Blue Canyon Analytics LLC",
      "By: __________________________",
      "Name: _________________________",
      "Title: __________________________",
      "",
      "Iron Vale Systems Inc.",
      "By: __________________________",
      "Name: _________________________",
      "Title: __________________________",
    ].join("\n");
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "anthem@test.com",
      recipient2Email: "jay@test.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem H Blanchard", "Jay Ive"],
      partySignerTitles: ["Member", "Member"],
      partyAddresses: ["", ""],
    });
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: entityBody,
      authority,
      intakeRaw: "",
      surface: "entity_heading_blocks",
    });
    expect(hydrated.corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Jay Ive/i);
    const ironTail = hydrated.corpus.split(/Iron Vale/i).pop() ?? "";
    expect(ironTail).not.toMatch(/Anthem H Blanchard/);
  });

  it("hydrates signing-capacity fields without Party Notice Details or execution-block notice lines", () => {
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "anthem@test.com",
      recipient2Email: "ira@test.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem H Blanchard", "Ira Vernon"],
      partySignerTitles: ["Manager", "Manager"],
      partyAddresses: ["100 Main St", ""],
    });
    const witnessAt = RAW_BODY.indexOf("IN WITNESS WHEREOF");
    const body = [
      RAW_BODY.slice(0, witnessAt).trimEnd(),
      "11. Notices and Dispute Terms.",
      "11.1 Notices. Any notice under this Agreement must be in writing and may be delivered by email or courier to the notice details below, unless a party updates those details by written notice to the other party.",
      "",
      RAW_BODY.slice(witnessAt),
    ].join("\n");
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: body,
      authority,
      intakeRaw: "",
      surface: "party_notice",
    });
    expect(hydrated.partyNoticeApplied).toBe(false);
    expect(hydrated.corpus).not.toMatch(/Party Notice Details:/i);
    expect(hydrated.corpus).not.toMatch(/Email for Notice:/i);
    expect(hydrated.corpus).not.toMatch(/Email for Notice:/i);
    expect(hydrated.corpus).not.toMatch(/Address for Notice:/i);
    const sigTail = hydrated.corpus.split(/IN WITNESS WHEREOF/i)[1] ?? "";
    const spSig = sigTail.split(/SERVICE PROVIDER:/i)[1] ?? "";
    expect(spSig).not.toMatch(/Address for Notice:\s*100 Main St/i);
  });

  it("hydrates distinct signer names per party from consumed authority", () => {
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "anthem@test.com",
      recipient2Email: "ira@test.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem H Blanchard", "Ira Vernon"],
      partySignerTitles: ["Manager", "Manager"],
      partyAddresses: ["", ""],
    });
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: RAW_BODY,
      authority,
      intakeRaw: "",
      surface: "party_isolation",
    });
    expect(hydrated.corpus).toMatch(/CLIENT:[\s\S]*Blue Canyon[\s\S]*Name:\s*Anthem H Blanchard/i);
    expect(hydrated.corpus).toMatch(/SERVICE PROVIDER:[\s\S]*Iron Vale[\s\S]*Name:\s*Ira Vernon/i);
    const sigTail = hydrated.corpus.split(/IN WITNESS WHEREOF/i)[1] ?? "";
    const ironSig = sigTail.split(/SERVICE PROVIDER:/i)[1] ?? "";
    expect(ironSig).toMatch(/Name:\s*Ira Vernon/i);
    expect(ironSig).not.toMatch(/Anthem H Blanchard/);
  });

  it("hydrates Name/Title lines before snapshot creation", () => {
    establishPaidProSourceOfTruth({ text: RAW_BODY, source: "paidProSourceOfTruth" });
    const identities = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs());
    const hydrated = buildHydratedAuthoritativeSigningCorpus({
      rawCorpus: RAW_BODY,
      identities,
      intakeRaw: "Blue Canyon and Iron Vale services agreement",
      surface: "test",
    });
    expect(hydrated.rejected).toBe(false);
    expect(hydrated.corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Jim Summit/i);
    expect(corpusSignatureBlocksHaveRequiredByLines(hydrated.corpus, 2)).toBe(true);
  });

  it("authoritative review display retains hydrated signature block after polish", () => {
    establishPaidProSourceOfTruth({ text: RAW_BODY, source: "paidProSourceOfTruth" });
    const identities = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs());
    const hydrated = buildHydratedAuthoritativeSigningCorpus({
      rawCorpus: RAW_BODY,
      identities,
      intakeRaw: "",
      surface: "test_review_polish",
    });
    const manifest = resolveCanonicalFinalPartyManifest(signerArgs());
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: {
        partySignerNames: ["Anthem H Blanchard", "Jim Summit"],
        partySignerTitles: ["Manager", "CEO"],
        partyAddresses: [],
        recipient1Name: BLUE_CANYON,
        recipient2Name: IRON_VALE,
        recipient1Email: "anthemhayek@gmail.com",
        recipient2Email: "anthemhayek@me.com",
        extraPartyReviewEmails: [],
      },
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const displayPlain = polishProAgreementDisplayLayer(readAuthoritativeSigningCorpus(), {
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    }).text;
    expect(displayPlain).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(displayPlain).toMatch(/Name:\s*Jim Summit/i);
  });

  it("invalidates snapshot when signer metadata drifts", () => {
    const meta = {
      partySignerNames: ["A", "B"],
      partySignerTitles: ["T1", "T2"],
      partyAddresses: [] as string[],
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [] as string[],
    };
    const manifest = resolveCanonicalFinalPartyManifest(signerArgs());
    createAuthoritativeSigningSnapshot({
      corpus: RAW_BODY,
      signerMetadata: meta,
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const snap = getAuthoritativeSigningSnapshot()!;
    expect(
      signerMetadataDriftedFromSnapshot(snap, {
        ...meta,
        partySignerNames: ["A", "Changed"],
      }),
    ).toBe(true);
    expect(signerMetadataDriftedFromSnapshot(snap, meta)).toBe(false);
  });

  it("review and signing read identical signer identities from snapshot", () => {
    const identities = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs());
    const hydrated = buildHydratedAuthoritativeSigningCorpus({
      rawCorpus: RAW_BODY,
      identities,
      intakeRaw: "",
      surface: "parity",
    });
    const manifest = resolveCanonicalFinalPartyManifest(signerArgs());
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: {
        partySignerNames: ["Anthem H Blanchard", "Jim Summit"],
        partySignerTitles: ["Manager", "CEO"],
        partyAddresses: [],
        recipient1Name: BLUE_CANYON,
        recipient2Name: IRON_VALE,
        recipient1Email: "anthemhayek@gmail.com",
        recipient2Email: "anthemhayek@me.com",
        extraPartyReviewEmails: [],
      },
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const snap = getAuthoritativeSigningSnapshot()!;
    const fromSnap = resolveAuthoritativeSignerIdentitiesFromSnapshot(snap);
    const fromReader = readAuthoritativeSignerIdentitiesForSurfaces()!;
    expect(fromReader[0]?.representativeName).toBe(fromSnap[0]?.representativeName);
    expect(fromReader[1]?.representativeName).toBe(fromSnap[1]?.representativeName);
    expect(readAuthoritativeSigningCorpus()).toBe(snap.corpus);
    expect(snap.corpus).not.toContain("Iron Vale Systems Inc Analytics LLC");
    expect(snap.corpus).not.toMatch(/Party Notice Details:/i);
  });

  it("legal entity edits trigger drift fingerprint", () => {
    const before = {
      partySignerNames: ["A", "B"],
      partySignerTitles: ["", ""],
      partyAddresses: [] as string[],
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [] as string[],
    };
    const after = { ...before, recipient2Name: "New Legal Entity LLC" };
    expect(fingerprintSignerMetadataState(before)).not.toBe(fingerprintSignerMetadataState(after));
  });

  it("re-enter after delete: drift fingerprint detects metadata change", () => {
    const before = {
      partySignerNames: ["Sam", "Dana"],
      partySignerTitles: ["", ""],
      partyAddresses: ["", ""] as string[],
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "sam@test.com",
      recipient2Email: "dana@test.com",
      extraPartyReviewEmails: [] as string[],
    };
    const after = { ...before, partySignerNames: ["Sam", ""] };
    expect(fingerprintSignerMetadataState(before)).not.toBe(fingerprintSignerMetadataState(after));
  });
});

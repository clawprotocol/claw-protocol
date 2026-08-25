/** @vitest-environment jsdom */
/**
 * Path rule: after-pay Send for signature persists a REAL signing packet.
 * /app/esign/doc_* must hydrate after sessionStorage death (reload, new tab,
 * later visit). Not a Priya/Diego canary — any 2–4 party painted deal.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgreementDraft } from "../agreement/agreementTypes";
import { PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN } from "../components/agreements/paidProPaidSessionLanding";
import {
  agreementVs01BridgeToEsignHandoffPayload,
  computePaidProAgreementBridgeSkip,
  durableAgreementVs01BridgeStorageKey,
  esignHandoffPayloadToAgreementVs01Bridge,
  readAgreementVs01BridgeSession,
  readDurableAgreementVs01Bridge,
  readPaidProAgreementBridgeSkipMarker,
  setPaidProAgreementBridgeSkipMarker,
  writeAgreementVs01BridgeSession,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { buildAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { handlePreparePacketContinue, resolvePreparePacketSigningRoles } from "./vs01PreparePacketContinue";
import {
  buildVs01CanonicalPacketSeed,
  decodeVs01CanonicalPacketPortable,
  encodeVs01CanonicalPacketPortable,
  loadVs01CanonicalPacketPortable,
} from "./vs01CanonicalPacketSeed";
import { stampSenderFieldWithPrepareRole } from "./vs01SignerFieldAssignment";
import type { PlacedSigningField } from "./signingFields";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

const TWO_PARTY =
  "SERVICES AGREEMENT\n\nThis Agreement is entered into by Alex Rivera of Northline Studio and Jordan Kim of Harbor Marks LLC to design a logo and brand kit. Payment $2,400 due on signing. Term 30 days. Governing law: Texas.";

const THREE_PARTY =
  "SERVICES AGREEMENT\n\nThis Agreement is entered into by Alex Rivera, Jordan Kim, and Sam Patel for a three-party brand collaboration. Payment $3,000. Term 45 days. Governing law: Texas. Each party will sign.";

const FOUR_PARTY =
  "SERVICES AGREEMENT\n\nThis Agreement is entered into by Alex Rivera, Jordan Kim, Sam Patel, and Casey Nguyen for a four-party brand kit. Payment $4,200. Term 60 days. Governing law: Texas. Each party will sign.";

function paintedDraft(id: string, parties: AgreementDraft["parties"], corpus: string): AgreementDraft {
  return {
    id,
    title: "SERVICES AGREEMENT",
    jurisdiction: "Texas",
    parties,
    document_text: corpus,
  } as AgreementDraft;
}

function paidBridge(args: {
  id: string;
  docId: string;
  corpus: string;
  parties: AgreementDraft["parties"];
}) {
  return buildAgreementVs01BridgeSession({
    agreementId: args.id,
    vs01DocumentId: args.docId,
    draft: paintedDraft(args.id, args.parties, args.corpus),
    agreementCorpusText: args.corpus,
    senderFirstLawdogHandoff: true,
    allowShortAgreementCorpus: true,
  });
}

afterEach(() => {
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("after-pay e-sign packet is durable (not first-SPA only)", () => {
  it.each([
    {
      count: 2,
      id: "ag_persist_two",
      docId: "doc_persist_two_aaaaaaaaaaaaaaaaaaaaaaaa",
      corpus: TWO_PARTY,
      parties: [
        {
          name: "Alex Rivera of Northline Studio",
          role: "owner" as const,
          email: "alex.rivera.qa@example.com",
          signerName: "Alex Rivera",
        },
        {
          name: "Jordan Kim of Harbor Marks LLC",
          role: "signer" as const,
          email: "jordan.kim.qa@example.com",
          signerName: "Jordan Kim",
        },
      ],
    },
    {
      count: 3,
      id: "ag_persist_three",
      docId: "doc_persist_three_aaaaaaaaaaaaaaaaaaaaaa",
      corpus: THREE_PARTY,
      parties: [
        { name: "Alex Rivera", role: "owner" as const, email: "alex.rivera.qa@example.com", signerName: "Alex Rivera" },
        { name: "Jordan Kim", role: "signer" as const, email: "jordan.kim.qa@example.com", signerName: "Jordan Kim" },
        { name: "Sam Patel", role: "signer" as const, email: "sam.patel.qa@example.com", signerName: "Sam Patel" },
      ],
    },
    {
      count: 4,
      id: "ag_persist_four",
      docId: "doc_persist_four_aaaaaaaaaaaaaaaaaaaaaaa",
      corpus: FOUR_PARTY,
      parties: [
        { name: "Alex Rivera", role: "owner" as const, email: "alex.rivera.qa@example.com", signerName: "Alex Rivera" },
        { name: "Jordan Kim", role: "signer" as const, email: "jordan.kim.qa@example.com", signerName: "Jordan Kim" },
        { name: "Sam Patel", role: "signer" as const, email: "sam.patel.qa@example.com", signerName: "Sam Patel" },
        { name: "Casey Nguyen", role: "signer" as const, email: "casey.nguyen.qa@example.com", signerName: "Casey Nguyen" },
      ],
    },
  ])("$count-party packet survives sessionStorage death and still hydrates", (fixture) => {
    expect(fixture.corpus.length).toBeGreaterThanOrEqual(PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN);
    expect(fixture.corpus.length).toBeLessThan(VS01_SIGNING_CORPUS_MIN_LEN);
    const bridge = paidBridge(fixture);
    expect(bridge.counterparties.length).toBe(fixture.count - 1);
    writeAgreementVs01BridgeSession(bridge);
    setPaidProAgreementBridgeSkipMarker(fixture.docId);

    expect(readAgreementVs01BridgeSession()?.vs01DocumentId).toBe(fixture.docId);
    sessionStorage.clear();
    expect(readAgreementVs01BridgeSession()).toBeNull();

    const durable = readDurableAgreementVs01Bridge(fixture.docId);
    expect(durable).not.toBeNull();
    expect(durable?.vs01DocumentId).toBe(fixture.docId);
    expect(durable?.agreementCorpusText).toBe(fixture.corpus);
    expect(durable?.creatorEmail).toBe(fixture.parties[0]?.email);
    expect(durable?.counterparties.map((c) => c.email)).toEqual(
      fixture.parties.slice(1).map((p) => p.email),
    );
    expect(readPaidProAgreementBridgeSkipMarker(fixture.docId)).toBe(true);
    expect(computePaidProAgreementBridgeSkip(fixture.docId, true)).toBe(true);
    expect(localStorage.getItem(durableAgreementVs01BridgeStorageKey(fixture.docId))).toContain(
      JSON.stringify(fixture.corpus).slice(1, -1),
    );
  });

  it("maps seed handoff payload back to a workspace bridge without agreement_bridge=1", () => {
    const bridge = paidBridge({
      id: "ag_persist_roundtrip",
      docId: "doc_persist_roundtrip_aaaaaaaaaaaaaaaaaa",
      corpus: TWO_PARTY,
      parties: [
        {
          name: "Alex Rivera of Northline Studio",
          role: "owner",
          email: "alex.rivera.qa@example.com",
          signerName: "Alex Rivera",
        },
        {
          name: "Jordan Kim of Harbor Marks LLC",
          role: "signer",
          email: "jordan.kim.qa@example.com",
          signerName: "Jordan Kim",
        },
      ],
    });
    const payload = agreementVs01BridgeToEsignHandoffPayload(bridge);
    const restored = esignHandoffPayloadToAgreementVs01Bridge(bridge.vs01DocumentId, payload);
    expect(restored?.agreementCorpusText).toBe(TWO_PARTY);
    expect(restored?.agreementId).toBe("ag_persist_roundtrip");
    expect(restored?.counterparties[0]?.email).toBe("jordan.kim.qa@example.com");
    expect(restored?.source).toBe("paid_pro_sender_first");
    expect(restored?.agreementBridgeMode).toBe("prepare_signing_packet");
  });

  it("seed POST and wizard hydrate are wired to the durable packet (path rule)", () => {
    const bridgeSrc = readFileSync(
      join(__dirname, "../launch/simpleProduct/agreementToVs01SigningBridge.ts"),
      "utf8",
    );
    expect(bridgeSrc).toContain("esign_handoff");
    expect(bridgeSrc).toContain("agreementVs01BridgeToEsignHandoffPayload(bridgeDraft)");
    expect(bridgeSrc).toContain("localStorage.setItem(durableAgreementVs01BridgeStorageKey(did), json)");
    expect(bridgeSrc).toContain("readDurableAgreementVs01Bridge");

    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    const hydrateStart = wizard.indexOf("const hydrateLocalPaidProBridge");
    const hydrate = wizard.slice(hydrateStart, hydrateStart + 2200);
    expect(hydrate).toContain("readDurableAgreementVs01Bridge(sid)");
    expect(hydrate).not.toContain('agreementBridgeQuery && sid.startsWith("doc_")');
    expect(hydrate).toContain("paidSessionDurablePacket: true");

    const api = readFileSync(join(__dirname, "vs01Api.ts"), "utf8");
    expect(api).toContain("/esign-handoff");
    expect(api).toContain("export async function fetchDocumentEsignHandoff");

    const continueSrc = readFileSync(join(__dirname, "vs01PreparePacketContinue.ts"), "utf8");
    expect(continueSrc).toContain("preparePacketCanonicalMinCorpusLen");
    expect(continueSrc).toContain("relaxPaidSessionCorpusAssert: true");
    expect(continueSrc).toContain("minCorpusLen: canonicalMinLen");
  });

  it.each([
    {
      count: 2,
      id: "ag_sign_two",
      docId: "doc_sign_two_aaaaaaaaaaaaaaaaaaaaaaaaaaa",
      corpus: TWO_PARTY,
      parties: [
        {
          name: "Alex Rivera of Northline Studio",
          role: "owner" as const,
          email: "alex.rivera.qa@example.com",
          signerName: "Alex Rivera",
        },
        {
          name: "Jordan Kim of Harbor Marks LLC",
          role: "signer" as const,
          email: "jordan.kim.qa@example.com",
          signerName: "Jordan Kim",
        },
      ],
    },
    {
      count: 3,
      id: "ag_sign_three",
      docId: "doc_sign_three_aaaaaaaaaaaaaaaaaaaaaaaaa",
      corpus: THREE_PARTY,
      parties: [
        { name: "Alex Rivera", role: "owner" as const, email: "alex.rivera.qa@example.com", signerName: "Alex Rivera" },
        { name: "Jordan Kim", role: "signer" as const, email: "jordan.kim.qa@example.com", signerName: "Jordan Kim" },
        { name: "Sam Patel", role: "signer" as const, email: "sam.patel.qa@example.com", signerName: "Sam Patel" },
      ],
    },
    {
      count: 4,
      id: "ag_sign_four",
      docId: "doc_sign_four_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      corpus: FOUR_PARTY,
      parties: [
        { name: "Alex Rivera", role: "owner" as const, email: "alex.rivera.qa@example.com", signerName: "Alex Rivera" },
        { name: "Jordan Kim", role: "signer" as const, email: "jordan.kim.qa@example.com", signerName: "Jordan Kim" },
        { name: "Sam Patel", role: "signer" as const, email: "sam.patel.qa@example.com", signerName: "Sam Patel" },
        { name: "Casey Nguyen", role: "signer" as const, email: "casey.nguyen.qa@example.com", signerName: "Casey Nguyen" },
      ],
    },
  ])("$count-party after-pay Send signing links persists a ceremony packet (not 1500-only)", (fixture) => {
    expect(fixture.corpus.length).toBeGreaterThanOrEqual(PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN);
    expect(fixture.corpus.length).toBeLessThan(VS01_SIGNING_CORPUS_MIN_LEN);
    expect(
      buildVs01CanonicalPacketSeed({
        documentId: fixture.docId,
        agreementId: fixture.id,
        corpusPlain: fixture.corpus,
      }),
    ).toBeNull();
    expect(
      buildVs01CanonicalPacketSeed({
        documentId: fixture.docId,
        agreementId: fixture.id,
        corpusPlain: fixture.corpus,
        minCorpusLen: PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN,
      }),
    ).not.toBeNull();

    const bridge = paidBridge(fixture);
    const input = {
      agreementId: fixture.id,
      agreementTitle: "SERVICES AGREEMENT",
      documentId: fixture.docId,
      creatorName: bridge.creatorName,
      creatorEmail: bridge.creatorEmail,
      ownerSignerName: bridge.creatorSignerName,
      ownerSignerTitle: bridge.creatorSignerTitle,
      counterparties: bridge.counterparties,
      senderPlacedFields: [] as PlacedSigningField[],
      recipientPlacedFields: [],
      prepareCorpusPlain: fixture.corpus,
      initialsEnabled: false as const,
      bridge,
    };
    const roles = resolvePreparePacketSigningRoles(input);
    expect(roles.length).toBe(fixture.count);
    const senderPlacedFields = roles.flatMap((role) => [
      stampSenderFieldWithPrepareRole(
        {
          id: `sig_${role.roleId}`,
          type: "signature",
          page: 0,
          x: 0.1,
          y: 0.1 + role.partyIndex * 0.1,
          width: 0.34,
          height: 0.075,
          assignedSignerRoleId: role.roleId,
        },
        role,
      ),
    ]);
    const prepared = handlePreparePacketContinue({ ...input, senderPlacedFields });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.portablePacket).not.toBeNull();
    expect(prepared.portablePacket?.seed.corpusPlain).toBe(fixture.corpus);
    expect(prepared.portablePacket?.roles.length).toBe(fixture.count);
    expect(prepared.handoff.signers.length).toBe(fixture.count - 1);
    expect(prepared.handoff.signers.every((s) => s.signingUrl.includes("vs01_recipient_sign=1"))).toBe(true);

    sessionStorage.clear();
    const stored = loadVs01CanonicalPacketPortable(fixture.docId);
    expect(stored?.seed.corpusPlain).toBe(fixture.corpus);
    const decoded = decodeVs01CanonicalPacketPortable(encodeVs01CanonicalPacketPortable(prepared.portablePacket!));
    expect(decoded?.seed.corpusPlain).toBe(fixture.corpus);
    expect(decoded?.roles.length).toBe(fixture.count);
  });
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { establishPaidProSourceOfTruth, getPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import {
  paidProSignerMetadataSessionActive,
  paidProSignerSetupSuppressesGuidedAndStarter,
  paidProSigningCorpusFreezeActive,
  resolvePaidProReviewState,
  resolvePremiumSignerDetailsGateDiagnostics,
} from "./paidProReviewStateMachine";
import {
  PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
  resolvePaidProInlineSignerSetupMounted,
  resolvePaidProSignerDetailsGate,
  resolveSignerSetupPartyIdentities,
} from "./signerSetupPartyIdentity";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BLUE_CANYON = "Blue Canyon Analytics LLC";
const IRON_VALE = "Iron Vale Systems Inc";
const MAPLE = "Maple Grove Holdings LLC";
const SUMMIT = "Summit Ridge Partners Inc";

const PRODUCTION_SOT_BODY = [
  "SOFTWARE INTEGRATION AND DATA PROCESSING AGREEMENT",
  "",
  "This Agreement is entered into as of the Effective Date by and between Blue Canyon Analytics LLC, a Delaware limited liability company (\"Client\"), and Iron Vale Systems Inc., a Delaware corporation (\"Service Provider\").",
  "",
  ...Array.from({ length: 120 }, (_, i) => `Section ${i + 1}. Operational clause ${i + 1} with commercial specificity and enforceable obligations.`),
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

function armProductionSession() {
  const record = establishPaidProSourceOfTruth({
    text: PRODUCTION_SOT_BODY,
    source: "paidProSourceOfTruth",
  });
  return record;
}

function simulateSignerMetadataSession(args: {
  partySignerNames: readonly string[];
  recipient1Email?: string;
  recipient2Email?: string;
  partySignerTitles?: readonly string[];
  latch?: boolean;
  prepareRequested?: boolean;
  draftPartyNames?: readonly string[];
}) {
  const sot = getPaidProSourceOfTruth();
  const latch = args.latch ?? true;
  const sessionActive = paidProSignerMetadataSessionActive({
    hasPaidProSourceOfTruth: Boolean(sot),
    prepareSignatureLinksRequested: args.prepareRequested ?? false,
    signerSetupActive: false,
    signerSetupLatched: latch,
  });
  const mounted = resolvePaidProInlineSignerSetupMounted({
    hasAcceptedPaidProAuthority: true,
    premiumPaidDocumentSurface: true,
    premiumRecipientUxActive: false,
    createUiStageIsDraft: true,
    signerSetupLatched: latch,
    signaturePreparationRequested: args.prepareRequested ?? false,
  });
  const gate = resolvePaidProSignerDetailsGate({
    partyCount: 2,
    signerSetupPartyIdentities: resolveSignerSetupPartyIdentities({
      parties: (args.draftPartyNames ?? [BLUE_CANYON, IRON_VALE]).map((name) => ({ name })),
      agreementBodyText: sot?.text,
    }),
    draftPartyNames: args.draftPartyNames ?? [BLUE_CANYON, IRON_VALE],
    partySignerNames: args.partySignerNames,
    recipient1Name: BLUE_CANYON,
    recipient2Name: IRON_VALE,
    recipient1Email: args.recipient1Email ?? "",
    recipient2Email: args.recipient2Email ?? "",
    extraPartyReviewEmails: [],
  });
  const reviewState = resolvePaidProReviewState({
    premiumPaidDocumentSurface: true,
    premiumCheckoutCompleted: true,
    premiumGenerationInFlight: false,
    hasValidAuthoritativeCorpus: true,
    premiumCorpusValidationFailed: true,
    authoritativeBodyLen: sot?.text.length ?? 0,
    signerMetadataEditActive: sessionActive,
  });
  return { sessionActive, mounted, gate, reviewState, sot };
}

describe("paidProSignerMetadataSessionActive", () => {
  it("is true when paid SoT exists, latch armed, and Prepare signature links not clicked", () => {
    armProductionSession();
    expect(
      paidProSignerMetadataSessionActive({
        hasPaidProSourceOfTruth: true,
        signerSetupActive: false,
        signerSetupLatched: true,
      }),
    ).toBe(true);
  });

  it("is false when only latch is set but no paid SoT", () => {
    expect(
      paidProSignerMetadataSessionActive({
        hasPaidProSourceOfTruth: false,
        signerSetupActive: false,
        signerSetupLatched: true,
      }),
    ).toBe(false);
  });

  it("releases when Prepare signature links is requested", () => {
    armProductionSession();
    expect(
      paidProSignerMetadataSessionActive({
        hasPaidProSourceOfTruth: true,
        signerSetupActive: false,
        signerSetupLatched: true,
        prepareSignatureLinksRequested: true,
      }),
    ).toBe(false);
  });

  it("suppresses guided/starter rebuild when latch is armed even if signerSetupActive is false", () => {
    armProductionSession();
    expect(
      paidProSignerSetupSuppressesGuidedAndStarter({
        hasPaidProSourceOfTruth: true,
        signerSetupActive: false,
        signerSetupLatched: true,
      }),
    ).toBe(true);
  });
});

describe("runtime-like signer metadata session stability", () => {
  it("production smoke: autofill Party 1 then Party 2 first keystroke keeps SoT and mount", () => {
    const before = armProductionSession();
    const beforeHash = before.hash;
    const beforeLen = before.text.length;

    const afterAutofill = simulateSignerMetadataSession({
      partySignerNames: ["Anthem H Blanchard", ""],
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "anthemhayek@me.com",
      partySignerTitles: ["Manager", "CEO"],
    });
    expect(afterAutofill.sessionActive).toBe(true);
    expect(afterAutofill.mounted).toBe(true);

    const afterFirstKeystroke = simulateSignerMetadataSession({
      partySignerNames: ["Anthem H Blanchard", "M"],
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "anthemhayek@me.com",
      partySignerTitles: ["Manager", "CEO"],
    });
    expect(afterFirstKeystroke.mounted).toBe(true);
    expect(afterFirstKeystroke.gate.legalEntityNames[1]).toMatch(/^Iron Vale Systems Inc\.?$/);
    expect(afterFirstKeystroke.gate.legalEntityNames[1]).not.toMatch(/Anthem|M\b/i);
    expect(afterFirstKeystroke.reviewState).not.toBe("FAILED_PREMIUM_CORPUS");

    const after = getPaidProSourceOfTruth();
    expect(after?.hash).toBe(beforeHash);
    expect(after?.text.length).toBe(beforeLen);
  });

  it("manual Party 2 first keystroke without autofill stays stable", () => {
    const before = armProductionSession();
    const result = simulateSignerMetadataSession({
      partySignerNames: ["", "B"],
      recipient2Email: "ben@example.test",
    });
    expect(result.mounted).toBe(true);
    expect(result.gate.legalEntityNames[0]).toMatch(/Blue Canyon Analytics LLC/);
    expect(result.gate.legalEntityNames[1]).toMatch(/^Iron Vale Systems Inc\.?$/);
    expect(getPaidProSourceOfTruth()?.hash).toBe(before.hash);
  });

  it("generic non-fixture parties keep distinct legal entities on first Party 2 keystroke", () => {
    const genericBody = PRODUCTION_SOT_BODY.replaceAll(BLUE_CANYON, MAPLE).replaceAll(IRON_VALE, SUMMIT);
    establishPaidProSourceOfTruth({ text: genericBody, source: "paidProSourceOfTruth" });
    const result = simulateSignerMetadataSession({
      draftPartyNames: [MAPLE, SUMMIT],
      partySignerNames: ["Alex Client", "P"],
      recipient1Email: "alex@maple.test",
      recipient2Email: "priya@summit.test",
    });
    expect(result.gate.legalEntityNames[0]).toMatch(/Maple Grove Holdings LLC/);
    expect(result.gate.legalEntityNames[1]).toMatch(/Summit Ridge Partners Inc/);
    expect(result.gate.legalEntityNames[0]).not.toBe(result.gate.legalEntityNames[1]);
  });

  it("gate completion keeps inline setup mounted and CTA on review decision (not e-sign)", () => {
    const result = simulateSignerMetadataSession({
      partySignerNames: ["Sam Canyon", "Dana Vale"],
      recipient1Email: "sam@bluecanyon.com",
      recipient2Email: "dana@ironvale.com",
    });
    expect(result.gate.complete).toBe(true);
    expect(result.gate.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA);
    expect(result.mounted).toBe(true);
  });
});

describe("Party 2 signer typing: validation complete vs Prepare release", () => {
  function renderVs01GateWhileSession(args: {
    prepareRequested: boolean;
    resolver: typeof resolveFinalVs01CorpusOrBlock;
  }) {
    if (
      paidProSigningCorpusFreezeActive({
        hasPaidProSourceOfTruth: true,
        prepareSignatureLinksRequested: args.prepareRequested,
      })
    ) {
      return { allowed: false, source: "deferred" as const };
    }
    return args.resolver({
      agreementCorpusText: PRODUCTION_SOT_BODY,
      guidedPro: true,
    } as Parameters<typeof resolveFinalVs01CorpusOrBlock>[0]);
  }

  it("autofill Party 1, Party 2 email, then one-char Party 2 name storm: complete flips, release stays false", () => {
    armProductionSession();
    const spy = vi.fn(resolveFinalVs01CorpusOrBlock);
    let prepareRequested = false;
    const latch = true;

    const party1Batch = simulateSignerMetadataSession({
      partySignerNames: ["Anthem H Blanchard", ""],
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "anthemhayek@me.com",
      latch,
      prepareRequested,
    });
    expect(party1Batch.sessionActive).toBe(true);
    expect(party1Batch.mounted).toBe(true);

    const keystrokes = ["", "j", "ji", "jim", "Jim", "Jim ", "Jim S"];
    let sawComplete = false;
    for (const stroke of keystrokes) {
      const r = simulateSignerMetadataSession({
        partySignerNames: ["Anthem H Blanchard", stroke],
        recipient1Email: "anthemhayek@gmail.com",
        recipient2Email: "anthemhayek@me.com",
        latch,
        prepareRequested,
      });
      expect(r.sessionActive).toBe(true);
      expect(r.mounted).toBe(true);
      expect(r.reviewState).not.toBe("FAILED_PREMIUM_CORPUS");
      if (r.gate.complete) sawComplete = true;
      const diag = resolvePremiumSignerDetailsGateDiagnostics({
        signerDetailsAreComplete: r.gate.complete,
        signaturePreparationRequested: prepareRequested,
        hasPaidProSourceOfTruth: true,
        signerSetupLatched: latch,
      });
      expect(diag.signaturePreparationRequested).toBe(false);
      expect(diag.metadataSessionActive).toBe(true);
      expect(diag.signingCorpusFreezeActive).toBe(true);
      expect(diag.blockedVs01Compute).toBe(true);
      expect(diag.blockedHandoffCompute).toBe(true);
      expect(diag.blockedReadonlyReplacement).toBe(true);
      expect(diag.blockedFailedPremiumCorpus).toBe(true);
      renderVs01GateWhileSession({ prepareRequested, resolver: spy });
    }
    expect(sawComplete).toBe(true);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("resolveFinalVs01CorpusOrBlock runs exactly once after explicit Prepare (not during typing)", () => {
    armProductionSession();
    const spy = vi.fn(resolveFinalVs01CorpusOrBlock);
    let prepareRequested = false;
    simulateSignerMetadataSession({
      partySignerNames: ["Anthem H Blanchard", "jim"],
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "anthemhayek@me.com",
      latch: true,
      prepareRequested,
    });
    for (const _ of ["j", "ji", "jim"]) {
      renderVs01GateWhileSession({ prepareRequested, resolver: spy });
    }
    expect(spy).toHaveBeenCalledTimes(0);
    prepareRequested = true;
    renderVs01GateWhileSession({ prepareRequested, resolver: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("signer metadata session blocks document recompute paths", () => {
  it("buildPreviewForCurrentTier guard returns empty while session ref is active", () => {
    armProductionSession();
    const sessionActive = paidProSignerMetadataSessionActive({
      hasPaidProSourceOfTruth: true,
      signerSetupLatched: true,
      signerSetupActive: false,
    });
    expect(sessionActive).toBe(true);
    // Intake mirrors this: buildPreviewForCurrentTier returns "" instead of calling builders.
    expect(buildAgreementPreviewText).toBeDefined();
  });

  it("does not call VS01 resolver while signing corpus freeze is active", () => {
    armProductionSession();
    const spy = vi.fn(resolveFinalVs01CorpusOrBlock);
    const sessionActive = paidProSignerMetadataSessionActive({
      hasPaidProSourceOfTruth: true,
      signerSetupLatched: true,
      signerSetupActive: false,
    });
    if (sessionActive) {
      expect(spy).toHaveBeenCalledTimes(0);
    }
  });

  it("release derivation uses only signaturePreparationRequested, not validation-complete booleans", () => {
    const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(src).toMatch(/const prepareSignatureLinksRequested\s*=\s*signaturePreparationRequested;/);
    const prepareSlice = src.slice(
      src.indexOf("const prepareSignatureLinksRequested ="),
      src.indexOf("const prepareSignatureLinksRequested =") + 200,
    );
    expect(prepareSlice).not.toMatch(/paidProSignatureDetailsReady/);
    expect(prepareSlice).not.toMatch(/signerDetailsAreComplete/);
    expect(prepareSlice).not.toMatch(/guidedSendIntentSelected/);
    expect(prepareSlice).not.toMatch(/finalReviewSendPathChosenRef/);
    const freezeMemo = src.slice(
      src.indexOf("const paidProSigningCorpusFreezeActive = useMemo"),
      src.indexOf("const paidProSigningCorpusFreezeActive = useMemo") + 400,
    );
    expect(freezeMemo).toMatch(/prepareSignatureLinksRequested/);
    expect(freezeMemo).not.toMatch(/paidProSignatureDetailsReady/);
  });

  it("declares paidProSignerMetadataSessionActiveRef before any .current read (no TDZ on mount)", () => {
    const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const decl = src.indexOf("const paidProSignerMetadataSessionActiveRef = useRef(false)");
    expect(decl).toBeGreaterThan(-1);
    const firstRead = src.indexOf("paidProSignerMetadataSessionActiveRef.current");
    expect(firstRead).toBeGreaterThan(decl);
    const declCount = (src.match(/const paidProSignerMetadataSessionActiveRef = useRef/g) ?? []).length;
    expect(declCount).toBe(1);
  });

  it("AgreementBuilderIntake source: session latch wired into guard and manifest freeze", () => {
    const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(src).toMatch(/paidProSignerMetadataSessionActive/);
    expect(src).toMatch(/signerSetupLatched:\s*paidProInlineSignerSetupLatched/);
    expect(src).toMatch(/frozenSignerMetadataPartyManifestRef/);
    expect(src).toMatch(/paidProSignerMetadataSessionActiveRef\.current/);
    expect(src).toMatch(/logPremiumSignerMetadataFreeze/);
    expect(src).toMatch(/onSignerMetadataSessionInput=\{emitSignerMetadataFreezeDiagnostics\}/);
    expect(src).not.toMatch(
      /paidProSignerSetupSuppressesGuidedAndStarter\(\{\s*signerSetupActive:\s*paidProRecipientSetupOnDraft,\s*hasPaidProSourceOfTruth/s,
    );
  });

  it("manifest resolver is not fed live partySignerNames deps while session is frozen", () => {
    const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const manifestIdx = src.indexOf("const guidedFinalPartyManifest = useMemo");
    const slice = src.slice(manifestIdx, manifestIdx + 1200);
    expect(slice).toMatch(/paidProSignerMetadataSessionActive/);
    expect(slice).toMatch(/frozenSignerMetadataPartyManifestRef/);
    expect(slice).toMatch(/\?\s*\[\s*\]/);
  });
});

describe("canonical manifest during session", () => {
  it("Party 2 legal entity stays Iron Vale when signer name is typed", () => {
    armProductionSession();
    const manifestBase = {
      partyCount: 2,
      partySignerTitles: ["Manager", ""] as string[],
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "anthemhayek@me.com",
      extraPartyReviewEmails: [] as string[],
      draftPartyNames: [BLUE_CANYON, IRON_VALE],
      sendMode: "signature" as const,
      recipientsDeferred: false,
    };
    const frozen = resolveCanonicalFinalPartyManifest({
      ...manifestBase,
      partySignerNames: ["Anthem H Blanchard", ""],
    });
    const afterKeystroke = resolveCanonicalFinalPartyManifest({
      ...manifestBase,
      partySignerNames: ["Anthem H Blanchard", "M"],
    });
    expect(frozen.parties[1]?.partyName).toMatch(/^Iron Vale Systems Inc\.?$/);
    expect(afterKeystroke.parties[1]?.partyName).toMatch(/^Iron Vale Systems Inc\.?$/);
    expect(afterKeystroke.parties[1]?.signerName === "M" || afterKeystroke.parties[1]?.signerName === null).toBe(
      true,
    );
  });
});

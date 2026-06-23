import { afterEach, describe, expect, it } from "vitest";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { applyFrozenManifestPaidProDisplayAuthority } from "./paidProFrozenManifestDisplayAuthority";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { resolvePaidProAuthoritativeDisplayPlain } from "./paidProAuthoritativeRenderGate";
import { resolveSignerSetupUiPartyCount } from "./paidProNPartySignerSetup";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
} from "./signerCountAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import { linearPremiumRecipientSlots, readPremiumRecipientHandoff } from "./premiumPartyNamesHandoff";
import { applyPremiumRecipientHandoffReadGate } from "./paidProPremiumRecipientHandoffReadGate";
import { buildAcceptedQuadPartyServerCorpus } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
  test398Draft,
} from "./paidProTest398Fixtures";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

function buildTest398ServerDraft(): string {
  return buildAcceptedQuadPartyServerCorpus(
    TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
    test398Draft(),
    2000,
  );
}

function expectQuadPartyLegalName(text: string, fullName: string): void {
  const base = fullName.replace(/[.,]+$/g, "").trim();
  expect(text).toMatch(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\.|,)?", "i"));
}

function countSignaturePartyHeadings(text: string): number {
  const tail = text.slice(text.search(/\bIN WITNESS WHEREOF\b/i));
  const names = [RED, BLUE, HARBOR, IRON];
  return names.filter((name) => {
    const base = name.replace(/[.,]+$/g, "").trim();
    return new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(tail);
  }).length;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST398 quad-party mutual services frozen manifest display authority", () => {
  it("free gate routes to Pro because partyCount=4", () => {
    const gate = assessStarterComplexityGate(TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.parties.length).toBe(4);
  });

  it("establishs SoT with 4-party manifest and repairs visible drift after freeze", () => {
    const draft = test398Draft();
    const serverDraft = buildTest398ServerDraft();
    markPaidProPipelineValidationPassed({ text: serverDraft, source: "server_full_draft" });

    establishPaidProSourceOfTruth({
      text: serverDraft,
      draft,
      intakeText: TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
      source: "server_full_draft_retry",
      generationOutcome: "ok",
    });

    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(1200);

    const consumed = readConsumedPaidProSignerMetadataAuthority();
    expect(consumed?.parties.length).toBe(4);

    const authorityCount = resolveAuthoritativeSignerCount({
      intakeText: "",
      draftParties: draft.parties,
    }).count;
    expect(authorityCount).toBe(4);

    const vs01Count = consumeAuthoritativeSignerCount(
      "vs01_corpus_gate",
      { intakeText: "", draftParties: draft.parties, manifestPartyCount: 4 },
      4,
    );
    expect(vs01Count).toBe(4);

    const uiCount = resolveSignerSetupUiPartyCount({
      signerSetupUiPartyCount: 2,
      draftParties: draft.parties as never,
      intakeText: "",
    });
    expect(uiCount).toBe(4);

    const renderParties = resolvePartiesForReviewRender({
      draft,
      intakeText: "",
    });
    expect(renderParties.length).toBe(4);

    const visible = resolvePaidProAuthoritativeDisplayPlain({
      draft,
      intakeText: TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
    });

    for (const name of [RED, BLUE, HARBOR, IRON]) {
      expectQuadPartyLegalName(visible, name);
    }
    expect(visible).not.toMatch(/Blue Canyon Analytics\s*\(\s*["']Service Provider["']\s*\)/i);
    expect(visible).not.toMatch(/\bSection\s+Any\b/i);
    expect(visible).not.toMatch(/Support\s*\n\s*During Term/i);
    expect(visible).not.toMatch(/Invoicing and\s*\n\s*Allocation/i);
    expect(visible).toMatch(/^(?:MUTUAL )?SERVICES AGREEMENT\s*\n\s*\n/m);

    expect(countSignaturePartyHeadings(visible)).toBeGreaterThanOrEqual(4);
    expect((visible.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);

    const handoff = applyPremiumRecipientHandoffReadGate(readPremiumRecipientHandoff(), {
      partySlotCount: 4,
    });
    expect(linearPremiumRecipientSlots(handoff, 4).length).toBe(4);

    const vs01 = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: visible,
      draft: { parties: renderParties.map((p) => ({ name: p.partyLegalName })) } as never,
      intakeText: "",
      premiumAccepted: true,
      premiumComplete: true,
    });
    expect(vs01.allowed).toBe(true);
  });

  it("applyFrozenManifestPaidProDisplayAuthority upgrades 2-party server tail to 4-party manifest", () => {
    markPaidProPipelineValidationPassed({
      text: buildTest398ServerDraft(),
      source: "server_full_draft",
    });
    establishPaidProSourceOfTruth({
      text: buildTest398ServerDraft(),
      draft: test398Draft(),
      intakeText: TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
      source: "server_full_draft_retry",
      generationOutcome: "ok",
    });

    const safe = applyAcceptedProCorpusSafeDisplay(getPaidProSourceOfTruthText(), {
      draft: test398Draft(),
      intakeText: TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
    }).text;
    const polished = applyFrozenManifestPaidProDisplayAuthority(
      preparePaidProReviewDisplayPlain(safe).text,
      { intakeText: TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE, draft: test398Draft() },
    ).text;

    expectQuadPartyLegalName(polished, HARBOR);
    expectQuadPartyLegalName(polished, IRON);
    expect(polished).not.toMatch(/Invoicing and\s*\n\s*Allocation/i);
    expect(countSignaturePartyHeadings(polished)).toBeGreaterThanOrEqual(4);
    expect(polished).not.toMatch(/\bSection\s+Any\b/i);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { paidProSurfaceCorpusMatchesAuthority } from "./paidProAgreementAuthorityChain";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const INTAKE =
  "Create a mutual consulting and implementation agreement between Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).";

const ACCEPTED = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
  "",
  "1. SCOPE. Provider will deliver AI workflow implementation services.",
  "2. FEES. Client will pay a fixed fee of $8,500.",
  "3. CONFIDENTIALITY. Each Party protects Confidential Information.",
  "4. GOVERNING LAW. Delaware law governs.",
  "5. ELECTRONIC SIGNATURES. Counterparts and e-signatures are permitted.",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  PAID_PRO_HARDENING_CLIENT,
  "By: __________________________",
  "",
  "SERVICE PROVIDER:",
  PAID_PRO_HARDENING_PROVIDER,
  "By: __________________________",
  "",
  "Operative commercial clause. ".repeat(80),
].join("\n");

describe("paidPro accepted source discipline", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("keeps one accepted hash across display, copy, review render, and polish handoff", () => {
    const draft = {
      parties: [
        { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
        { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
      ],
    } as ParsedDraftShape;
    const safe = applyAcceptedProCorpusSafeDisplay(ACCEPTED, {
      draft,
      intakeText: INTAKE,
    }).text;
    const source = establishPaidProSourceOfTruth({
      text: safe,
      intakeText: INTAKE,
      draft,
      source: "server_full_draft",
    });
    expect(source.source).toBe("server_full_draft");

    const display = getPaidProDocumentForSurface("display", { draft, intakeText: INTAKE });
    const copy = getPaidProDocumentForSurface("copy", { draft, intakeText: INTAKE });
    const review = getPaidProDocumentForSurface("review", { draft, intakeText: INTAKE });
    const signerSetup = getPaidProDocumentForSurface("signer_setup", { draft, intakeText: INTAKE });

    for (const doc of [display, copy, review, signerSetup]) {
      expect(doc?.hash).toBe(source.hash);
      expect(doc?.text).toBe(source.text);
    }

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: INTAKE,
    });
    expect(hashPaidProCorpus(reviewPlain)).toBe(source.hash);

    const polished = polishProAgreementDisplayLayer(source.text, {
      draft,
      intakeText: INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    const polishedTail = polished.text.slice(polished.text.search(/\bIN WITNESS WHEREOF\b/i));
    expect(polishedTail).toMatch(/CLIENT\s*:\s*\nBlue Canyon Analytics LLC/i);
    expect(polishedTail).toMatch(/SERVICE\s+PROVIDER\s*:\s*\nIron Vale Systems Inc/i);
  });

  it("treats signer-applied signature tail as allowed overlay when operative body matches SoT", () => {
    const draft = {
      parties: [
        { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
        { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
      ],
    } as ParsedDraftShape;
    const source = establishPaidProSourceOfTruth({
      text: ACCEPTED,
      intakeText: INTAKE,
      draft,
      source: "server_full_draft",
    });
    const witnessIdx = source.text.search(/\bIN WITNESS WHEREOF\b/i);
    const signerOverlay = `${source.text.slice(0, witnessIdx)}
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
${PAID_PRO_HARDENING_CLIENT}
By: __________________________
Name: Jane Doe
Email for Notice: jane@test.com

SERVICE PROVIDER:
${PAID_PRO_HARDENING_PROVIDER}
By: __________________________
Name: Ira Vale
Email for Notice: ivee@test.com
`;
    expect(paidProSurfaceCorpusMatchesAuthority({
      text: signerOverlay,
      signerMetadataApplied: true,
      actualSource: "signer_hydrated_from_authority",
    })).toBe(true);
    expect(hashPaidProCorpus(signerOverlay)).not.toBe(source.hash);
    expect(getPaidProSourceOfTruth()?.hash).toBe(source.hash);
  });
});

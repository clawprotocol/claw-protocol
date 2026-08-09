/** @vitest-environment jsdom */
/**
 * Production retest (2026-08-09): simple 2-party NDA arrived with Party 3–5 notice
 * stanzas + demo identities despite intake naming real parties.
 * Locks intake-authoritative count (2) + identity overlay + excess-stanza trim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCanonicalPartyMetadataBundle,
  clearCanonicalPartyMetadata,
  persistCanonicalPartyMetadata,
  readCanonicalPartyMetadata,
} from "./canonicalPartyMetadataAuthority";
import { applyIntakeDraftPlaceholders } from "./applyIntakeDraftPlaceholders";
import {
  countOperativeIfToNoticeStanzas,
  ensureOperativeNoticeStanzaCountAuthorityAtFreeze,
  repairFusedNoticesHeadingToPriorClause,
  repairIncompleteIfToNoticeStanzas,
  trimOperativeNoticeStanzasToPartyCount,
} from "./paidProPartyNoticeDetails";
import { clearPriorPaidAuthorityForFreshCreateSubmit } from "../../launch/newAgreementSessionReset";

const INTAKE =
  "Draft a mutual non-disclosure agreement between Anthem Blanchard and Acme LLC " +
  "covering confidential business information for a 2-year term. Governing law: Florida.";

const DEMO_NDA_WITH_EXTRA_NOTICES = `AGREEMENT
This Agreement (this "Agreement") is entered into as of the Effective Date by and between ABC LLC ("Client") and Sample Corp ("Service Provider").

1. Purpose and Scope
The Parties may disclose Confidential Information for evaluating a business relationship.

10. Termination
Either Party may terminate this Agreement at any time by written notice. Termination will not affect accrued rights as stated in this Agreement12. Notices

Any notice under this Agreement must be in writing.

If to ABC LLC:
ABC LLC
Attn: both parties
provided during signer setup.

If to Sample Corp:
Sample Corp
Attn: both parties
provided during signer setup.

If to Party 3:
Party 3
provided during signer setup.

If to Party 4:
Party 4
provided during signer setup.

If to Party 5:
Party 5
provided during signer setup.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
ABC LLC
By: __________________________

SERVICE PROVIDER:
Sample Corp
By: __________________________
`;

function noticeParties() {
  return [
    {
      partyIndex: 0,
      partyLegalName: "Anthem Blanchard",
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    },
    {
      partyIndex: 1,
      partyLegalName: "Acme LLC",
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    },
  ];
}

describe("bipartite NDA party authority regression", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearCanonicalPartyMetadata();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCanonicalPartyMetadata();
    sessionStorage.clear();
  });

  it("fresh create clears stale 5-slot canonical metadata so it cannot re-inflate", () => {
    const stale = buildCanonicalPartyMetadataBundle({
      legalEntities: ["Alpha LLC", "Beta Inc", "Gamma Corp", "Delta LP", "Echo Ltd"],
      intakeText: "among Alpha LLC, Beta Inc, Gamma Corp, Delta LP, and Echo Ltd",
      mutationSource: "structured_intake",
    });
    persistCanonicalPartyMetadata(stale);
    expect(readCanonicalPartyMetadata()?.parties).toHaveLength(5);

    clearPriorPaidAuthorityForFreshCreateSubmit();
    expect(readCanonicalPartyMetadata()).toBeNull();

    // Merge with a prior 5-party bundle must clamp to the new intake's 2 legal entities.
    const fresh = buildCanonicalPartyMetadataBundle({
      legalEntities: ["Northstar Analytics LLC", "Contoso MidMarket Inc"],
      intakeText:
        "Draft a mutual NDA between Northstar Analytics LLC and Contoso MidMarket Inc for 2 years. Governing law: Florida.",
      existing: stale,
      mutationSource: "structured_intake",
    });
    expect(fresh.parties).toHaveLength(2);
    expect(fresh.parties.map((p) => p.partyLegalName)).toEqual([
      "Northstar Analytics LLC",
      "Contoso MidMarket Inc",
    ]);
  });

  it("trims Party 3–5 notice stanzas when authority is bipartite", () => {
    const fused = repairFusedNoticesHeadingToPriorClause(DEMO_NDA_WITH_EXTRA_NOTICES);
    expect(fused.text).toMatch(/12\.\s+NOTICES/i);
    expect(fused.text).not.toMatch(/Agreement12\. Notices/i);

    const roleContext = {
      intakeText: INTAKE,
      draftPartyNames: ["Anthem Blanchard", "Acme LLC"],
      acceptedCorpus: fused.text,
    };
    const trimmed = trimOperativeNoticeStanzasToPartyCount(fused.text, 2);
    expect(trimmed.repairs).toContain("notice:trim_excess_stanzas");
    expect(countOperativeIfToNoticeStanzas(trimmed.text)).toBe(2);
    expect(trimmed.text).not.toMatch(/If to Party 3:/i);

    const freeze = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(
      fused.text,
      noticeParties(),
      roleContext,
    );
    expect(countOperativeIfToNoticeStanzas(freeze.text)).toBe(2);
    expect(freeze.text).not.toMatch(/If to Party [345]:/i);

    const repaired = repairIncompleteIfToNoticeStanzas(fused.text, noticeParties(), roleContext);
    expect(countOperativeIfToNoticeStanzas(repaired.text)).toBe(2);
    expect(repaired.text).not.toMatch(/If to Party [345]:/i);
  });

  it("overlays demo opening identities with intake names (OpenAI prose, intake identity)", () => {
    const { text, repairs } = applyIntakeDraftPlaceholders({
      text: DEMO_NDA_WITH_EXTRA_NOTICES,
      intakeText: INTAKE,
    });
    expect(text).toContain("Anthem Blanchard");
    expect(text).toContain("Acme LLC");
    expect(text).not.toMatch(/\bABC LLC\b/);
    expect(text).not.toMatch(/\bSample Corp\b/);
    expect(repairs.some((r) => r.startsWith("intake_identity_overlay:"))).toBe(true);
  });
});

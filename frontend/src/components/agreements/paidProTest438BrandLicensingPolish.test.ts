/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  countOperativeIfToNoticeStanzas,
  removeRedundantNoticesSubheading,
} from "./paidProPartyNoticeDetails";
import { repairWeakGoverningLawAndVenueClauses } from "./paidProExecutiveDraftPolish";
import { resolvePaidProServicesAgreementTitle } from "./paidProOpeningRecitalGuard";
import { resolveAgreementTitleFromIntakeScope } from "./paidProAgreementTitleScope";
import {
  TEST437_BRAND_LICENSING_INTAKE,
  test437BrandLicensingDraft,
} from "./paidProTest437BrandLicensingFixtures";
import {
  buildTest438BrandLicensingLiveServerCorpus,
  TEST438_MIN_ACCEPTED_LEN,
  TEST438_PARTIES,
  TEST438_PARTY_ADDRESSES,
  TEST438_PARTY_EMAILS,
  test438DraftWithNoticeContacts,
} from "./paidProTest438BrandLicensingPolishFixtures";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";

const TRANSACTION_TITLE =
  "MANUFACTURING, DISTRIBUTION, LICENSING AND MARKETING SERVICES AGREEMENT";

afterEach(() => {
  resetPaidProPipelineTestIsolation();
});

describe("TEST438 — Brand Licensing/Distribution executive draft polish", () => {
  it("intake scope selects transaction-specific title without breaking generic services fallback", () => {
    const scoped = resolveAgreementTitleFromIntakeScope(TEST437_BRAND_LICENSING_INTAKE);
    expect(scoped.titleUpper).toBe(TRANSACTION_TITLE);
    expect(resolvePaidProServicesAgreementTitle(TEST437_BRAND_LICENSING_INTAKE)).toBe(TRANSACTION_TITLE);

    const generic = resolveAgreementTitleFromIntakeScope(
      "Create a services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC. Texas law.",
    );
    expect(generic.titleUpper).toBe("SERVICES AGREEMENT");
  });

  it("removes duplicate 13. NOTICES when composite section 13 already includes Notices", () => {
    const raw = buildTest438BrandLicensingLiveServerCorpus();
    expect(raw).toMatch(/13\. Assignment, Dispute Resolution, Governing Law and Notices/i);
    expect(raw).toMatch(/^\s*13\. NOTICES\s*$/m);

    const repaired = removeRedundantNoticesSubheading(raw);
    expect(repaired.repairs).toContain("notice:remove_redundant_notices_subheading");
    expect(repaired.text).not.toMatch(/^\s*13\. NOTICES\s*$/m);
    expect(repaired.text).toMatch(/13\. Assignment, Dispute Resolution, Governing Law and Notices/i);
  });

  it("repairs weak governing law and venue when Oklahoma jurisdiction is in intake", () => {
    const raw = buildTest438BrandLicensingLiveServerCorpus();
    const repaired = repairWeakGoverningLawAndVenueClauses(
      raw,
      TEST437_BRAND_LICENSING_INTAKE,
      test437BrandLicensingDraft(),
    );
    expect(repaired.repairs.length).toBeGreaterThan(0);
    expect(repaired.text).toMatch(/governed by the laws of the State of Oklahoma/i);
    expect(repaired.text).not.toMatch(
      /governed by the laws of the jurisdiction mutually agreed by the parties in writing/i,
    );
    expect(repaired.text).not.toMatch(/mutually agreed by the parties in writing or, if not agreed/i);
  });

  it("prepare + freeze preserves 4-party substantive corpus with polished title, notices, and governing law", () => {
    const raw = buildTest438BrandLicensingLiveServerCorpus();
    const draft = test438DraftWithNoticeContacts();

    const prepared = preparePaidProServerDocumentForAcceptance(
      raw,
      draft,
      TEST437_BRAND_LICENSING_INTAKE,
      { surface: "test438_prepare" },
    );

    expect(prepared.text.length).toBeGreaterThan(TEST438_MIN_ACCEPTED_LEN);
    expect(prepared.text).toContain(TRANSACTION_TITLE);
    expect(prepared.text).not.toMatch(/^\s*13\. NOTICES\s*$/m);
    expect(prepared.text).toMatch(/governed by the laws of the State of Oklahoma/i);
    expect(prepared.text).not.toMatch(
      /governed by the laws of the jurisdiction mutually agreed by the parties in writing/i,
    );

  const noticeHydrated = applyPaidProNoticeContactAuthority(prepared.text, {
      draft,
      intakeText: TEST437_BRAND_LICENSING_INTAKE,
      surface: "test438_notice_hydration",
      blockOnUnresolved: false,
    });

    for (const party of TEST438_PARTIES) {
      expect(noticeHydrated.text).toContain(party);
      expect(noticeHydrated.text).toContain(TEST438_PARTY_EMAILS[party]);
      expect(noticeHydrated.text).toContain(TEST438_PARTY_ADDRESSES[party].slice(0, 12));
    }

    const freeze = buildPaidProFreezeCandidate({
      text: noticeHydrated.text,
      draft,
      intakeText: TEST437_BRAND_LICENSING_INTAKE,
      source: "server_full_draft",
      surface: "test438_freeze",
    });

    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    expect(freeze.text.length).toBeGreaterThan(TEST438_MIN_ACCEPTED_LEN);
    expect(countOperativeIfToNoticeStanzas(freeze.text)).toBe(4);
    expect(countPaidProExecutionBlocks(freeze.text)).toBe(1);
    expect((freeze.text.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);

    for (const party of TEST438_PARTIES) {
      const stanzaRe = new RegExp(
        `If to ${party.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:[\\s\\S]*?${party.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i",
      );
      expect(freeze.text).toMatch(stanzaRe);
    }

    const duplicateNameLines = TEST438_PARTIES.flatMap((party) => {
      const escaped = party.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = freeze.text.match(new RegExp(`^${escaped}\\s*$`, "gm")) ?? [];
      return matches.length > 4 ? [party] : [];
    });
    expect(duplicateNameLines).toEqual([]);
  });
});

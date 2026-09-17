/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { commitAcceptedReviewCorpusPromotion } from "../../agreement/reviewCorpusAuthority";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProReviewSessionAuthorityForTests,
  readPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";

const IRON = "Ironclad Systems Group LLC";
const HARBOR = "Harborline Data Solutions Inc.";
const NORTH = "Northwind Automation Partners LLC";
const SILVER = "Silver Mesa Analytics LP";
const REVIEWER = "olivia.hart@silvermesaanalytics.com";
const ACCEPTED_NOTICE = "notices@silvermesaanalytics.com";
const SILVER_MESA_INTAKE = [
  "Four-party white-label AI workflow software and infrastructure rollout under Texas law.",
  `${IRON} is the Sponsor. ${HARBOR} is the Vendor. ${NORTH} is the Integrator. ${SILVER} is the Analyst.`,
  "Contract value $187,500 over 6 milestone payments. Term 24 months.",
  "Notice emails: ethan.cole@ironcladsg.com, maya.bennett@harborlinedata.com, lucas.reed@northwindap.io, olivia.hart@silvermesaanalytics.com.",
].join(" ");
const AGREEMENT_ID = "ag-silver-mesa-notice-accept";

function silverMesaPaper(noticeEmail: string): string {
  const core = [
    "JOINT AI SOFTWARE AND INFRASTRUCTURE ROLLOUT AGREEMENT",
    "",
    `This Agreement is among ${IRON} ("Sponsor"), ${HARBOR} ("Vendor"), ${NORTH} ("Integrator"), and ${SILVER} ("Analyst").`,
    "",
    "1. PARTIES AND ROLES",
    `${IRON} is the Sponsor. ${HARBOR} is the Vendor. ${NORTH} is the Integrator. ${SILVER} is the Analyst.`,
    "2. SCOPE OF SERVICES",
    "The parties will jointly perform a white-label AI workflow software and infrastructure rollout.",
    "3. FEES AND PAYMENT",
    "Ironclad Systems Group LLC pays the $187,500 contract value over 6 milestone payments.",
    "4. TERM AND DURATION",
    "The initial term is 24 months with automatic yearly renewal unless a party gives 45 days written notice.",
    "5. INTELLECTUAL PROPERTY",
    "Foreground IP developed solely by a party remains that party's property.",
    "6. CONFIDENTIALITY",
    "Each party will protect the other parties' confidential information for five years using at least reasonable care.",
    "7. LIMITATION OF LIABILITY",
    "Except for confidentiality breaches, no party's aggregate liability exceeds fees paid in the twelve months preceding the claim.",
    "8. GOVERNING LAW",
    "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-law rules.",
  ].join("\n");
  let filler = "";
  while (`${core}\n${filler}\nIN WITNESS`.length < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 200) {
    filler += `\nSection extra. Operative commercial paragraph continues the same Texas four-party assignment.`;
  }
  const notices = [
    "9. NOTICES",
    "Formal notices must be delivered to each party's distinct notice address.",
    "Sponsor address: 3 Ironclad Way, Austin, TX 78701.",
    `If to ${IRON}: Email: ethan.cole@ironcladsg.com`,
    `If to ${HARBOR}: Email: maya.bennett@harborlinedata.com`,
    `If to ${NORTH}: Email: lucas.reed@northwindap.io`,
    `If to ${SILVER}: ${SILVER} Attn: Olivia Hart, Ops Director at Silver Mesa Email: ${noticeEmail}`,
    "",
    "IN WITNESS WHEREOF, the parties have executed this Agreement.",
    `${IRON} By: Ethan Cole Title: CEO`,
    `${HARBOR} By: Maya Bennett Title: CTO`,
    `${NORTH} By: Lucas Reed Title: Managing Partner`,
    `${SILVER} By: Olivia Hart Title: Ops Director`,
  ].join("\n");
  return `${core}\n${filler}\n${notices}`;
}

function silverMesaDraft(args: {
  noticeInLiveFields: string;
  applied?: boolean;
}): AgreementDraft {
  const live = silverMesaPaper(args.noticeInLiveFields);
  return {
    id: AGREEMENT_ID,
    title: "Joint AI Software and Infrastructure Rollout Agreement",
    jurisdiction: "TX",
    parties: [
      { id: "p1", name: IRON, role: "owner", email: "ethan.cole@ironcladsg.com" },
      { id: "p2", name: HARBOR, role: "reviewer", email: "maya.bennett@harborlinedata.com" },
      { id: "p3", name: NORTH, role: "reviewer", email: "lucas.reed@northwindap.io" },
      { id: "p4", name: SILVER, role: "reviewer", email: REVIEWER },
    ],
    purpose: live,
    payment_terms: "$187,500",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T01:00:00.000Z",
    versions: [],
    document_text: live,
    server_full_document_text: live,
    premium_full_document_text: silverMesaPaper(REVIEWER),
    rendered_document_text: silverMesaPaper(REVIEWER),
    audit_log: args.applied
      ? [
          {
            event_type: "recipient_proposal_applied",
            at: "2026-09-16T01:00:00.000Z",
            value: { proposal_id: "prop-notice" },
          },
        ]
      : [
          {
            event_type: "recipient_proposal_pending",
            at: "2026-09-16T00:30:00.000Z",
            value: { proposal_id: "prop-notice", draft: { purpose: silverMesaPaper(ACCEPTED_NOTICE) } },
          },
        ],
  } as AgreementDraft;
}

describe("Silver Mesa accepted notice revision", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
  });

  it("does not replace the current document with an unaccepted proposal", () => {
    const original = silverMesaPaper(REVIEWER);
    const pending = silverMesaDraft({ noticeInLiveFields: REVIEWER, applied: false });
    establishPaidProSourceOfTruth({
      text: original,
      source: "server_full_draft",
      draft: pending,
      intakeText: SILVER_MESA_INTAKE,
    });
    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      draft: pending,
      agreementId: AGREEMENT_ID,
      paidProActive: true,
      acceptedCanonicalPlain: original,
    });
    expect(painted.plain).toContain(REVIEWER);
    expect(painted.plain).not.toContain(ACCEPTED_NOTICE);
    expect(getPaidProSourceOfTruthText()).toContain(REVIEWER);
    expect(pending.parties?.[3]?.email).toBe(REVIEWER);
  });

  it("advances SoT, session authority, and article display after owner accept despite older session/render fields", () => {
    const original = silverMesaPaper(REVIEWER);
    const accepted = silverMesaPaper(ACCEPTED_NOTICE);
    expect(accepted).toContain("$187,500");
    expect(accepted).toMatch(/Texas/);
    expect(accepted).toContain(`${SILVER} ("Analyst")`);

    const first = establishPaidProSourceOfTruth({
      text: original,
      source: "server_full_draft",
      draft: silverMesaDraft({ noticeInLiveFields: REVIEWER }),
      intakeText: SILVER_MESA_INTAKE,
    });
    expect(first.text).toContain(REVIEWER);
    expect(readPaidProReviewSessionAuthority()?.hash).toBe(first.hash);

    const applied = silverMesaDraft({ noticeInLiveFields: ACCEPTED_NOTICE, applied: true });
    expect(applied.document_text).toContain(ACCEPTED_NOTICE);
    expect(applied.server_full_document_text).toContain(ACCEPTED_NOTICE);
    expect(applied.premium_full_document_text).toContain(REVIEWER);
    expect(applied.parties?.[3]?.email).toBe(REVIEWER);

    const historicalOriginal = original;
    const promotion = commitAcceptedReviewCorpusPromotion({
      agreementId: AGREEMENT_ID,
      corpusText: accepted,
      draft: applied,
      source: "review_first_final_corpus",
      oldTextMarker: REVIEWER,
      acceptedTextMarker: ACCEPTED_NOTICE,
    });

    expect(promotion.acceptedProposalHash).not.toBe(first.hash);
    expect(historicalOriginal).toContain(`Email: ${REVIEWER}`);
    expect(historicalOriginal).not.toContain(ACCEPTED_NOTICE);

    expect(getPaidProSourceOfTruthText()).toContain(ACCEPTED_NOTICE);
    expect(getPaidProSourceOfTruthText()).not.toContain(`Email: ${REVIEWER}`);
    expect(readPaidProReviewSessionAuthority()?.corpusPlain).toContain(ACCEPTED_NOTICE);
    expect(readPaidProReviewSessionAuthority()?.corpusPlain).not.toContain(`Email: ${REVIEWER}`);

    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      draft: applied,
      agreementId: AGREEMENT_ID,
      paidProActive: true,
      acceptedCanonicalPlain: accepted,
    });
    expect(painted.plain).toContain(ACCEPTED_NOTICE);
    expect(painted.plain).not.toContain(`Email: ${REVIEWER}`);
    expect(painted.plain).toContain("$187,500");
    expect(painted.plain).toMatch(/Texas/);
    expect(applied.parties?.[3]?.email).toBe(REVIEWER);
  });

  it("keeps an accepted notice address distinct from the reviewer access email on render", () => {
    const accepted = silverMesaPaper(ACCEPTED_NOTICE);
    const applied = silverMesaDraft({ noticeInLiveFields: ACCEPTED_NOTICE, applied: true });
    establishPaidProSourceOfTruth({
      text: accepted,
      source: "server_full_draft",
      draft: applied,
      intakeText: SILVER_MESA_INTAKE,
      allowShorterOverwrite: true,
    });
    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      draft: applied,
      agreementId: AGREEMENT_ID,
      paidProActive: true,
      acceptedCanonicalPlain: accepted,
    });
    expect(painted.plain).toContain(ACCEPTED_NOTICE);
    expect(painted.plain).not.toContain(`Email: ${REVIEWER}`);
    expect(applied.parties?.[3]?.email).toBe(REVIEWER);
  });
});

import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import fixtureCorpus from "../components/agreements/qa/paidProHardening/fixtures/freeProQaTemplateATest204.txt?raw";

export const PAID_PRO_REVIEW_UX_VISUAL_CLIENT = "Blue Canyon Analytics LLC";
export const PAID_PRO_REVIEW_UX_VISUAL_PROVIDER = "Iron Vale Systems Inc.";

export const PAID_PRO_REVIEW_UX_VISUAL_INTAKE = `between ${PAID_PRO_REVIEW_UX_VISUAL_CLIENT} and ${PAID_PRO_REVIEW_UX_VISUAL_PROVIDER}`;

export const PAID_PRO_REVIEW_UX_VISUAL_DRAFT = {
  parties: [
    { name: PAID_PRO_REVIEW_UX_VISUAL_CLIENT, role: "Client" },
    { name: PAID_PRO_REVIEW_UX_VISUAL_PROVIDER, role: "Service Provider" },
  ],
} as ParsedDraftShape;

export const PAID_PRO_REVIEW_UX_VISUAL_CORPUS = fixtureCorpus.replace(/\r\n/g, "\n").trimEnd();

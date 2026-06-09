import { hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";
import {
  SECTION_9_BODY_RE,
  SECTION_9_HEADING_RE,
  SECTION_10_HEADING_RE,
} from "./reviewFirstDocumentDisplayParity";

export const SECTION_9_BODY_TEXT =
  "This Agreement constitutes the entire agreement between the parties and supersedes all prior agreements or understandings. This Agreement may be amended only by a written agreement signed by both parties. The provisions of this Agreement that by their nature should survive termination shall survive.";

export type Test323LiveSection9TraceStage =
  | "authoritative_corpus"
  | "final_display_corpus"
  | "polished_corpus"
  | "reviewer_html"
  | "mounted_dom";

export type Section9StageAnalysis = {
  hasSection9Heading: boolean;
  hasSection9Body: boolean;
  hasSection10Heading: boolean;
  section9Index: number;
  section10Index: number;
  section9To10Preview: string;
};

export function analyzeSection9StageContent(plain: string): Section9StageAnalysis {
  const text = (plain || "").replace(/\r\n/g, "\n");
  const section9Index = text.search(/9\.\s+MISCELLANEOUS/i);
  const section10Index = text.search(/10\.\s+ELECTRONIC SIGNATURES/i);
  let section9To10Preview = "";
  if (section9Index >= 0 && section10Index > section9Index) {
    section9To10Preview = text.slice(section9Index, section10Index).replace(/\s+/g, " ").trim().slice(0, 220);
  } else if (section9Index >= 0) {
    section9To10Preview = text.slice(section9Index, section9Index + 220).replace(/\s+/g, " ").trim();
  }
  return {
    hasSection9Heading: SECTION_9_HEADING_RE.test(text),
    hasSection9Body: SECTION_9_BODY_RE.test(text),
    hasSection10Heading: SECTION_10_HEADING_RE.test(text),
    section9Index,
    section10Index,
    section9To10Preview,
  };
}

export function section9HeadingImmediatelyPrecedesSection10(plain: string): boolean {
  const text = (plain || "").replace(/\s+/g, " ");
  return /9\.\s+MISCELLANEOUS\s+10\.\s+ELECTRONIC SIGNATURES/i.test(text);
}

export function section9BodyBetweenHeadings(plain: string): boolean {
  const text = (plain || "").replace(/\r\n/g, "\n");
  const idx9 = text.search(/9\.\s+MISCELLANEOUS/i);
  const idx10 = text.search(/10\.\s+ELECTRONIC SIGNATURES/i);
  if (idx9 < 0 || idx10 <= idx9) return false;
  const between = text.slice(idx9, idx10);
  if (SECTION_9_BODY_RE.test(between)) return true;
  const stripped = between.replace(/9\.\s+MISCELLANEOUS/i, "").trim();
  return stripped.length >= 40;
}

let lastTest323LiveSection9TraceKey = "";

export function resetTest323LiveSection9TraceLogsForTests(): void {
  lastTest323LiveSection9TraceKey = "";
}

export function logTest323LiveSection9Trace(payload: {
  stage: Test323LiveSection9TraceStage;
  agreementId: string | null;
  surface: string;
  source: string;
  corpusHash?: string | null;
  htmlHash?: string | null;
  hasSection9Heading: boolean;
  hasSection9Body: boolean;
  hasSection10Heading: boolean;
  section9Index: number;
  section10Index: number;
  section9To10Preview: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const hash =
    payload.stage === "reviewer_html"
      ? payload.htmlHash ?? null
      : payload.corpusHash ?? null;
  const key = JSON.stringify({ ...payload, hash });
  if (key === lastTest323LiveSection9TraceKey) return;
  lastTest323LiveSection9TraceKey = key;
  // eslint-disable-next-line no-console
  console.info("[test323-live-section9-trace]", {
    ...payload,
    corpusHash: payload.corpusHash ?? null,
    htmlHash: payload.htmlHash ?? null,
  });
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.DEV &&
    payload.hasSection9Heading &&
    !payload.hasSection9Body &&
    payload.stage !== "authoritative_corpus"
  ) {
    // eslint-disable-next-line no-console
    console.warn("[test323-live-section9-trace-leak]", payload);
  }
}

export function fingerprintStageText(text: string): string {
  return hashPaidProCorpus((text || "").trim());
}

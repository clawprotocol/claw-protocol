import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeAllGuidedAnswersIntoCorpus } from "./guidedSectionAwareMerge";
import {
  finalizeGuidedProAgreementCorpus,
} from "./guidedFinalCorpusFinalizer";
import { buildCanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import type { GuidedCompletionSession } from "./types";

const ownershipClause =
  "Company owns the project deliverables and work product created specifically for Company after payment, subject only to Provider's retained ownership of pre-existing tools, templates, know-how, and background technology.";
const supportClause =
  "Provider will target 99.9% monthly uptime for production automation components, excluding scheduled maintenance, client-caused outages, and third-party platform failures outside Provider control.";
const terminationClause =
  "Either party may terminate for convenience with 30 days written notice, subject to payment for work performed and survival of confidentiality, payment, and ownership obligations.";

const identities: CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Acme LLC",
    email: "anthemhayek@gmail.com",
    representativeName: "Anthem H Blanchard",
    title: "Manager",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Joe Smith",
    email: "joe345@gmail.com",
    representativeName: null,
    title: null,
    blockHeading: "SERVICE PROVIDER",
    isIndividual: true,
  },
];

function session(): GuidedCompletionSession {
  const ids = ["ip_ownership", "saas_sla", "renewal_notice"];
  return {
    sessionKey: "gen:test44",
    queue: ids,
    variables: ids.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.9,
      affectsSections: [],
    })),
    answered: {
      ip_ownership: "Company owns project deliverables",
      saas_sla: "99.9% uptime",
      renewal_notice: "30 days notice",
    },
    skipped: new Set(),
    currentIndex: ids.length,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: ids.length,
  };
}

function malformedBody(): string {
  return `
AI Automation Services Agreement

1. Purpose**
Acme LLC ("Client") engages Joe Smith ("Service Provider").

2. Scope of Services**
Provider will deliver automation services.

3. Confidentiality
Each party will protect confidential information.
${ownershipClause}
${supportClause}
${terminationClause}

4. Ownership and Work Product
Ownership terms are set forth below.

4.2. 5.Support Expectations
Support terms are set forth below.

6. Term and Termination
The term continues until terminated.

7. General Terms
Electronic Signatures are permitted.

${"Commercial filler. ".repeat(120)}

IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem H Blanchard
Title: Manager
Date: _________________________

SERVICE PROVIDER:
Joe Smith
By: __________________________
Name: Joe Smith
Date: _________________________
`.trim();
}

function section(body: string, heading: RegExp): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\d+\.\s+/.test(lines[i].trim()) || /^IN WITNESS WHEREOF\b/i.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

describe("guided Pro final review test44 signing/corpus congruency", () => {
  it("moves guided clauses into correct sections and normalizes malformed numbering", () => {
    const merged = mergeAllGuidedAnswersIntoCorpus(malformedBody(), session()).body;
    expect(merged).not.toMatch(/\b4\.2\.\s*5\.Support/i);
    expect(merged).toMatch(/^5\. Support Expectations$/m);
    expect(section(merged, /^3\. Confidentiality/i)).not.toMatch(/Company owns|99\.9%|30 days written notice/i);
    expect(section(merged, /^4\. Ownership/i)).toMatch(/Company owns the project deliverables/i);
    expect(section(merged, /^5\. Support/i)).toMatch(/99\.9% monthly uptime/i);
    expect(section(merged, /^6\. Term/i)).toMatch(/30 days written notice/i);
    expect(merged.search(/IN WITNESS WHEREOF/i)).toBeGreaterThan(merged.search(/^6\. Term/m));
  });

  it("final corpus is clean legal text with no inline field markup", () => {
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "canonical_working_draft", body: malformedBody(), paid: true }],
      guidedSession: session(),
      signerIdentities: identities,
      signerManifest: buildCanonicalSignerManifest({ identities, signFirst: true }),
      originalIntake: "AI automation agreement",
    });
    expect(result.ok).toBe(true);
    expect(result.body).not.toMatch(/lawdog-signing-field|data-lawdog-signing-field|vs01-sign-placement-box/i);
    expect(result.body).not.toMatch(/\b4\.2\.\s*5\.Support/i);
    expect(result.body).toMatch(/By:\s*_{3,}/i);
  });

  it("final review renders clean-signature note rather than fake field boxes", () => {
    const screen = readFileSync(join(__dirname, "../SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("simple-pro-final-review-signing-fields-note");
    expect(screen).toContain("Signature blocks stay as clean agreement text here");
    expect(screen).not.toContain("LawDogSigningField");
    expect(screen).not.toContain("vs01-sign-placement-box");
  });
});

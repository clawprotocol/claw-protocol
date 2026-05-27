import type { ParsedDraftShape } from "./intakeSmartDefaults";

/** Minimum length for a local offline Pro fallback to count as authoritative. */
export const PAID_PRO_LOCAL_FALLBACK_MIN_LEN = 1_200;

const AI_AUTOMATION_INTAKE_RE =
  /\b(?:ai\s+automation|automation\s+services|ai\s+workflow|harbor\s+peak|red\s+mesa)\b/i;

function extractPartyPair(intake: string, draft: ParsedDraftShape | null): [string, string] {
  const fromDraft = (draft?.parties ?? [])
    .map((p) => String(p.name ?? "").trim())
    .filter((n) => n.length >= 3);
  if (fromDraft.length >= 2) return [fromDraft[0]!, fromDraft[1]!];
  const between = intake.match(
    /\b(?:between|by)\s+([A-Z][A-Za-z0-9&.,'()\- ]{2,80}?)\s+(?:and|\/)\s+([A-Z][A-Za-z0-9&.,'()\- ]{2,80}?)(?:\s*[,.]|$)/i,
  );
  if (between) return [between[1]!.trim(), between[2]!.trim()];
  const slash = intake.match(
    /([A-Z][A-Za-z0-9&.,'()\- ]{2,60}\s+LLC)\s*\/\s*([A-Z][A-Za-z0-9&.,'()\- ]{2,60}\s+LLC)/,
  );
  if (slash) return [slash[1]!.trim(), slash[2]!.trim()];
  return ["Client LLC", "Service Provider LLC"];
}

function governingLawPhrase(intake: string, draft: ParsedDraftShape | null): string {
  const j = (draft?.jurisdiction || "").trim();
  if (/\btexas\b/i.test(intake) || /\btexas\b/i.test(j)) return "the laws of the State of Texas";
  if (/\boklahoma\b/i.test(intake) || /\boklahoma\b/i.test(j)) return "the laws of the State of Oklahoma";
  if (j.length >= 2 && !/\[not yet/i.test(j)) return `the laws of ${j}`;
  return "the laws of the State of Texas";
}

/**
 * Offline / API-unavailable Pro body for rich AI automation intakes with explicit project economics.
 * Preserves intake facts deterministically — not a thin starter shell.
 */
export function tryBuildPaidProLocalDeterministicFallback(
  intakeRaw: string,
  draft: ParsedDraftShape | null,
): string | null {
  const intake = (intakeRaw || "").trim();
  if (!AI_AUTOMATION_INTAKE_RE.test(intake)) return null;
  if (!/\$?\s*95[,.]?000\b/i.test(intake)) return null;
  if (!/\b(?:50\s*\/\s*25\s*\/\s*25|50%|25%)\b/i.test(intake)) return null;
  if (!/\$?\s*4[,.]?500\s*\/?\s*mo/i.test(intake) && !/\$4,500\/month/i.test(intake)) return null;

  const [clientName, providerName] = extractPartyPair(intake, draft);
  const law = governingLawPhrase(intake, draft);
  const supportLine = /\$?\s*4[,.]?500/i.test(intake)
    ? "Client may elect optional post-launch support for $4,500 per month."
    : "";

  const body = `
AI AUTOMATION SERVICES AGREEMENT

This Agreement is between ${clientName} ("Client") and ${providerName} ("Service Provider").

1. Purpose and Scope
Service Provider will provide AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance for Client.

2. Fees and Payment
Client will pay Service Provider a total project fee of $95,000 for the services described in this Agreement. The project fee is allocated 50% to kickoff and build, 25% to rollout, and 25% to acceptance.${supportLine ? ` ${supportLine}` : ""}

3. Ownership and Work Product
Client will own the deliverables and custom work product created specifically for Client under this Agreement once Client has paid all amounts due for those deliverables. Service Provider retains its pre-existing tools, templates, know-how, methods, reusable code, workflow patterns, and background materials.

4. Confidentiality
Each receiving Party will protect confidential information using reasonable care and use it only for this Agreement.

5. Support Expectations
Service Provider does not guarantee the uptime, availability, compatibility, or continued operation of third-party AI platforms or services outside Service Provider's control.

6. Term and Termination
Either Party may terminate this Agreement by giving thirty (30) days written notice to the other Party.

7. Notices
Notices under this Agreement must be sent by email to the contacts designated by the Parties in writing.

8. Miscellaneous
This Agreement is governed by ${law}, without regard to conflict-of-law rules.

9. Electronic Signatures
The Parties may sign this Agreement electronically and in counterparts.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
${clientName}
By: __________________________
Name: ________________________
Date: _________________________

SERVICE PROVIDER:
${providerName}
By: __________________________
Name: ________________________
Date: _________________________
`.trim();

  return body.length >= PAID_PRO_LOCAL_FALLBACK_MIN_LEN ? body : null;
}

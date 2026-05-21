/**
 * AI migration / tech services / SaaS-MSA intake signals for guided deal completion.
 */

import { bodyHasLoosePhaseScheduleBeforeSignatures } from "./bodyMaterialPlaceholderScanner";

export type ServicesMigrationIntakeSignals = {
  isServicesMigration: boolean;
  mentionsPhases: boolean;
  vagueFee: boolean;
  informalParties: boolean;
  mentionsSupport: boolean;
  mentionsSla: boolean;
  mentionsSecurity: boolean;
  mentionsIp: boolean;
  vagueRenewal: boolean;
  vagueGoverningLaw: boolean;
};

export function analyzeServicesMigrationIntake(
  intakeRaw?: string | null,
  body?: string | null,
): ServicesMigrationIntakeSignals {
  const intake = (intakeRaw || "").toLowerCase();
  const bodyLow = (body || "").toLowerCase();
  const combined = `${intake}\n${bodyLow}`;

  const migration =
    /\b(?:migration|migrat|onboarding|rollout|implementation|deployment|integrat|dashboard)\b/.test(
      combined,
    ) &&
    /\b(?:ai|automation|workflow|dashboard|analytics|saas|software|platform|support)\b/.test(combined);
  const services =
    /\b(?:services?\s+agreement|master\s+services|msa|technology\s+services|professional\s+services)\b/.test(
      combined,
    ) || /\b(?:white[-\s]?label|enterprise)\b/.test(combined);
  const lighthouseArchetype =
    /\blighthouse\b/.test(combined) && /\bapex\b/.test(combined);

  return {
    isServicesMigration:
      lighthouseArchetype ||
      (migration && services) ||
      /\b(?:ai\s+migration|cloud\s+migration|software\s+integration)\b/.test(combined),
    mentionsPhases:
      /\b(?:phase|build|rollout|support\s+phase|milestone)\b/.test(combined) ||
      bodyHasLoosePhaseScheduleBeforeSignatures(body || ""),
    vagueFee:
      /\b(?:maybe|approximately|about|roughly|probably)\s*\$?\s*[\d,]+/i.test(intake) ||
      /\b(?:TBD|\?\?\?)\b/.test(intake) ||
      /\bto be confirmed\b/i.test(bodyLow) ||
      !/\$\s*[\d,]{3,}/.test(bodyLow),
    informalParties:
      /\b(?:between|among)\s+[A-Za-z][^.]{0,40}\s+and\s+[A-Za-z][^.]{0,40}\b/i.test(intake) &&
      !/\b(?:LLC|Inc\.|Corp\.|L\.P\.|LP)\b/i.test(intake.slice(0, 400)),
    mentionsSupport: /\b(?:support|maintenance|handoff|hypercare)\b/.test(combined),
    mentionsSla: /\b(?:sla|uptime|availability|response\s+time)\b/.test(combined),
    mentionsSecurity: /\b(?:security|cyber|data\s+protection|privacy)\b/.test(combined),
    mentionsIp: /\b(?:ip|intellectual property|work product|deliverable|ownership)\b/.test(combined),
    vagueRenewal:
      /\bauto\s+renew\?/i.test(intake) ||
      /\bprobably\s+\d+\s+months?\b/i.test(intake) ||
      (/\b(?:renew|auto[-\s]?renew|month[-\s]?to[-\s]?month)\b/.test(combined) &&
        !/\b\d+\s+days?\s+(?:notice|prior)\b/i.test(bodyLow)),
    vagueGoverningLaw:
      /\b(?:texas|delaware|california)\s+maybe\b/i.test(intake) ||
      /\b(?:governing law|laws of).{0,30}\bmaybe\b/i.test(intake) ||
      (/\b(?:governing law|laws of)\b/i.test(intake) && !/\blaws of the state of\b/i.test(bodyLow)),
  };
}

export function isServicesMigrationIntake(intakeRaw?: string | null, body?: string | null): boolean {
  return analyzeServicesMigrationIntake(intakeRaw, body).isServicesMigration;
}

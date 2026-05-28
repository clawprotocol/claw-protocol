/**
 * AI migration / tech services / SaaS-MSA intake signals for guided deal completion.
 */

import { intakeHasFullLegalEntityParties, intakeSpecifiesSimpleFixedFee } from "../canonicalPartyIdentityResolver";
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
    /\b(?:services?\s+agreement|master\s+services|msa|technology\s+services|professional\s+services|make\s+(?:this\s+)?into\s+an?\s+agreement)\b/.test(
      combined,
    ) || /\b(?:white[-\s]?label|enterprise)\b/.test(combined);
  const lighthouseArchetype =
    /\blighthouse\b/.test(combined) && /\bapex\b/.test(combined);

  return {
    isServicesMigration:
      lighthouseArchetype ||
      (lighthouseArchetype && /\b(?:dashboard|onboarding|support|migration)\b/.test(combined)) ||
      (migration && services) ||
      /\b(?:ai\s+migration|cloud\s+migration|software\s+integration)\b/.test(combined),
    mentionsPhases:
      intakeSpecifiesSimpleFixedFee(intakeRaw)
        ? false
        : /\b(?:phase|build|rollout|support\s+phase|milestone|schedule\s+a)\b/.test(combined) ||
          bodyHasLoosePhaseScheduleBeforeSignatures(body || ""),
    vagueFee:
      intakeSpecifiesSimpleFixedFee(intakeRaw)
        ? false
        : /\b(?:maybe|approximately|about|roughly|probably)\s*\$?\s*[\d,]+/i.test(intake) ||
          /\b(?:maybe|probably)\s+[\d,]+k?\b/i.test(intake) ||
          /\b(?:TBD|\?\?\?)\b/.test(intake) ||
          /\bto be confirmed\b/i.test(bodyLow) ||
          /\bamount\s+to\s+be\s+agreed\b/i.test(bodyLow) ||
          /\bestimated\s+only\b/i.test(bodyLow) ||
          (!/\$\s*[\d,]{3,}/.test(bodyLow) && !/\$\s*[\d,]{3,}/.test(intake)),
    informalParties:
      intakeHasFullLegalEntityParties(intakeRaw)
        ? false
        : (lighthouseArchetype && !/\b(?:LLC|Inc\.|Corp\.|L\.P\.|LP)\b/i.test(bodyLow.slice(0, 1500))) ||
          (/\b(?:between|among)\s+[A-Za-z][^.]{0,40}\s+and\s+[A-Za-z][^.]{0,40}\b/i.test(intake) &&
            !/\b(?:LLC|Inc\.|Corp\.|L\.P\.|LP)\b/i.test(intake.slice(0, 400))),
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

const INTAKE_403030_RE =
  /40\s*%[\s\S]{0,80}30\s*%[\s\S]{0,80}30\s*%|40\s*\/\s*30\s*\/\s*30|forty.{0,24}thirty.{0,24}thirty/i;

const NO_THIRD_PARTY_UPTIME_GUARANTEE_RE =
  /\bno\s+(?:guaranteed?|guarantee)\s+(?:uptime|availability|sla)\b|\b(?:do\s+not|don't|without)\s+(?:guarantee|guaranteeing)\s+.{0,40}(?:third[-\s]?party|ai\s+platform|platform)\b|\bthird[-\s]?party\s+ai\s+platforms?\s+.{0,40}(?:no|without)\s+guarantee/i;

export function intakeSpecifies403030PhaseSplit(intakeRaw?: string | null, body?: string | null): boolean {
  return INTAKE_403030_RE.test(`${intakeRaw || ""}\n${body || ""}`);
}

export function intakeDisclaimsThirdPartyUptimeGuarantee(intakeRaw?: string | null, body?: string | null): boolean {
  return NO_THIRD_PARTY_UPTIME_GUARANTEE_RE.test(`${intakeRaw || ""}\n${body || ""}`);
}

/** AI automation setup / workflow support agreements (casual monthly-fee services). */
export function isAutomationServicesIntake(intakeRaw?: string | null, body?: string | null): boolean {
  const intake = (intakeRaw || "").toLowerCase();
  const bodyLow = (body || "").toLowerCase();
  const combined = `${intake}\n${bodyLow}`;
  const automation =
    /\b(?:ai\s+automation|automation\s+setup|workflow|dashboard|automations?)\b/.test(combined) &&
    /\b(?:support|agreement|helping|service\s+provider|monthly|confidential|ownership|terminat)\b/.test(combined);
  const referralInIntake = /\breferral\s+protection\b|\bchannel\s+partner\b|\brevenue\s+share\s+on\s+intro/.test(intake);
  return automation && !referralInIntake;
}

/**
 * Consulting / software-development intake signals for guided deal completion.
 * Uses intake text only — not generated agreement body — to avoid false positives.
 */

export type ConsultingIntakeSignals = {
  isConsultingDev: boolean;
  evolvingScope: boolean;
  mentionsSupport: boolean;
  mentionsIp: boolean;
  remote: boolean;
  startupFreelancer: boolean;
  aiRebuild: boolean;
  milestoneHints: boolean;
};

export function analyzeConsultingIntake(intakeRaw?: string | null, _body?: string | null): ConsultingIntakeSignals {
  const intake = (intakeRaw || "").toLowerCase();
  const consulting =
    /\bconsult(?:ing|ant)\b/.test(intake) ||
    /\bmaster\s+services\s+agreement\b/.test(intake) ||
    (/\bprofessional\s+services\b/.test(intake) && /\bconsult/i.test(intake));
  const dev =
    /\b(?:developer|development|software|workflow|automation|rebuild|stack|internal\s+systems?)\b/.test(intake);
  const services = /\b(?:services?|contractor|freelanc|engagement|deliverable)\b/.test(intake);
  return {
    isConsultingDev: consulting || (dev && services),
    evolvingScope: /\b(?:evolv|flexib|chang(?:e|ing)|scope may|requirements may|may evolve|expand over time)\b/.test(intake),
    mentionsSupport: /\bsupport\b/.test(intake),
    mentionsIp: /\b(?:ip|intellectual property|work product|ownership)\b/.test(intake),
    remote: /\bremote\b/.test(intake),
    startupFreelancer: /\b(?:startup|freelanc|independent contractor)\b/.test(intake),
    aiRebuild: /\b(?:ai|automation|workflow)\b/.test(intake) && /\b(?:rebuild|stack|systems?)\b/.test(intake),
    milestoneHints: /\bmilestone|phase|deliverable\b/.test(intake),
  };
}

export function isConsultingDevIntake(intakeRaw?: string | null, body?: string | null): boolean {
  return analyzeConsultingIntake(intakeRaw, body).isConsultingDev;
}

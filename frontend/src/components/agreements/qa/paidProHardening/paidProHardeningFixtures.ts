import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedDraftShape } from "../../intakeSmartDefaults";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "../../authoritativeSignerHydration";
import { applyAcceptedProCorpusSafeDisplay } from "../../acceptedProCorpusSafeDisplay";
import { setPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { repairMalformedPaidProAgreementRecital } from "../../paidProAgreementRecitalRepair";
import { resolveCanonicalPartyIdentitiesFromIntake } from "../../canonicalPartyIdentityResolver";
import { ensurePaidProServicesAgreementOpening } from "../../paidProOpeningRecitalGuard";
import {
  buildLivePaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataAuthority,
} from "../../paidProSignerMetadataAuthority";
import { establishPaidProSourceOfTruth } from "../../paidProSourceOfTruth";

export const PAID_PRO_HARDENING_CLIENT = "Blue Canyon Analytics LLC";
export const PAID_PRO_HARDENING_PROVIDER = "Iron Vale Systems Inc.";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export type PaidProHardeningFixtureBundle = {
  name: string;
  rawCorpus: string;
  intakeText: string;
  draft: ParsedDraftShape;
};

export function loadPaidProHardeningFixture(baseName: string): PaidProHardeningFixtureBundle {
  const corpusPath = join(FIXTURE_DIR, `${baseName}.txt`);
  const intakePath = join(FIXTURE_DIR, `${baseName}.intake.txt`);
  const rawCorpus = readFileSync(corpusPath, "utf8").replace(/\r\n/g, "\n").trimEnd();
  const intakeText = existsSync(intakePath)
    ? readFileSync(intakePath, "utf8").replace(/\r\n/g, "\n").trim()
    : `between ${PAID_PRO_HARDENING_CLIENT} and ${PAID_PRO_HARDENING_PROVIDER}`;
  const draft = {
    parties: [
      { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
      { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
    ],
  } as ParsedDraftShape;
  return { name: baseName, rawCorpus, intakeText, draft };
}

export const TEST219_INTAKE_PROMPT =
  "I need a consulting agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc. for AI workflow implementation services. Fixed fee $8,500. Client owns work product after full payment. Delaware law.";

/** Test219: long accepted corpus with correct CLIENT / SERVICE PROVIDER signature block at end. */
export function buildExpandedTest219AcceptedCorpus(): string {
  const base = loadPaidProHardeningFixture("freeProQaTemplateATest204").rawCorpus;
  const witnessIdx = base.search(/\nIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? base.slice(0, witnessIdx).trimEnd() : base;
  const tail = witnessIdx >= 0 ? base.slice(witnessIdx).trim() : "";
  const pad =
    "Service Provider will deliver AI workflow implementation services, milestones, acceptance testing, and documentation. Client owns work product after full payment. ";
  let body = head;
  let section = 11;
  while (body.length < 10_500) {
    body += `\n\n${section}. Implementation and Acceptance. ${pad.repeat(5)}`;
    section += 1;
  }
  return tail ? `${body}\n\n${tail}` : body;
}

export function loadTest219HardeningFixture(): PaidProHardeningFixtureBundle {
  const intakePath = join(FIXTURE_DIR, "freeProQaTemplateATest219.intake.txt");
  const intakeText = existsSync(intakePath)
    ? readFileSync(intakePath, "utf8").replace(/\r\n/g, "\n").trim()
    : TEST219_INTAKE_PROMPT;
  return {
    name: "freeProQaTemplateATest219",
    rawCorpus: buildExpandedTest219AcceptedCorpus(),
    intakeText,
    draft: {
      parties: [
        { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
        { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
      ],
    } as ParsedDraftShape,
  };
}

/** Test223: >10k corpus with opening roles correct and inverted secondary recital. */
export function buildExpandedTest223PreSignerCorpus(): string {
  const base = buildExpandedTest219AcceptedCorpus();
  const inverted = `\n\nRECITAL (scheduling). ${PAID_PRO_HARDENING_CLIENT} ("Service Provider") and ${PAID_PRO_HARDENING_PROVIDER} ("Client") acknowledge the Statement of Work.\n`;
  const firstSection = base.search(/\n\n1\.\s/);
  if (firstSection < 0) return `${base}${inverted}`;
  return `${base.slice(0, firstSection)}${inverted}${base.slice(firstSection)}`;
}

export function buildTest223SignerAuthority(): PaidProSignerMetadataAuthority {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: PAID_PRO_HARDENING_CLIENT,
    recipient2Name: PAID_PRO_HARDENING_PROVIDER,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "ira.banks@ironvale.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ira Banks"],
    partySignerTitles: ["Manager", "Member"],
    partyAddresses: ["1027 S. Rainbow Blvd., #124", "138 Main St., Clarkville, OH 23087"],
  });
}

export function buildTest204SignerAuthority(): PaidProSignerMetadataAuthority {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: PAID_PRO_HARDENING_CLIENT,
    recipient2Name: PAID_PRO_HARDENING_PROVIDER,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "ivee23@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ira Vale"],
    partySignerTitles: ["Manager", "Member"],
    partyAddresses: ["1027 S. Rainbow Blvd., #124", "138 Main St., Clarkville, OH 23087"],
  });
}

/** Establish SoT from golden fixture through the same safe-display path as acceptance. */
export function armPaidProHardeningSession(args: {
  fixture: PaidProHardeningFixtureBundle;
  withSignerMetadata?: boolean;
}): { acceptedText: string; authority?: PaidProSignerMetadataAuthority } {
  const safe = applyAcceptedProCorpusSafeDisplay(args.fixture.rawCorpus, {
    draft: args.fixture.draft,
    intakeText: args.fixture.intakeText,
  });
  let acceptedText = safe.text;
  const records = resolveCanonicalPartyIdentitiesFromIntake(args.fixture.intakeText, [
    PAID_PRO_HARDENING_CLIENT,
    PAID_PRO_HARDENING_PROVIDER,
  ]);
  if (records.length >= 2) {
    acceptedText = ensurePaidProServicesAgreementOpening(acceptedText, records).text;
  }
  const recital = repairMalformedPaidProAgreementRecital(acceptedText);
  acceptedText = recital.text;
  establishPaidProSourceOfTruth({ text: acceptedText, source: "server_full_draft" });
  let authority: PaidProSignerMetadataAuthority | undefined;
  if (args.withSignerMetadata) {
    authority = buildTest204SignerAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: acceptedText,
      authority,
      intakeRaw: args.fixture.intakeText,
      surface: "paid_pro_hardening_finalize",
      signatureRegionOnly: true,
    });
    if (!hydrated.rejected && hydrated.corpus.trim().length > 0) {
      setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
    }
  }
  return { acceptedText, authority };
}

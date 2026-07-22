/**
 * RC Journey 7 Authority — production service-boundary mocks for signing → completion → verify.
 */
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { agreementPublicVerifyPath } from "../../src/agreement/agreementPublicVerify";
import { RcDeliveryAdapter, tokenFingerprintFromHref, type DeliveryMessageRecord } from "./rcDeliveryAdapter";

export type AuthorityPacketEvidence = {
  packetId: string;
  packetRevision: string;
  agreementId: string;
  documentId: string;
  frozenSnapshotHash: string;
  signerIds: string[];
  partyIds: string[];
  tokenFingerprints: string[];
  executionBlockCount: number;
  generationCount: number;
  requestBodies: unknown[];
};

export type AuthoritySignerCompletion = {
  signerRoleId: string;
  participantId: string;
  signedAt: string;
};

export type AuthorityCompletionEvidence = {
  artifactId: string;
  executedHash: string;
  frozenHash: string;
  ownerCounterFinal: string;
  completionEventCount: number;
  signerCompletions: AuthoritySignerCompletion[];
};

export const AUTHORITY_FROZEN_HASH = "rc_authority_frozen_corpus_v1";
export const AUTHORITY_EXECUTED_HASH = "rc_authority_executed_hash_v1";

export type AuthoritySigningChainState = {
  packet: AuthorityPacketEvidence | null;
  /** Authoritative portable packet captured from signing-links-sent (production shape). */
  portablePacket: Record<string, unknown> | null;
  delivery: RcDeliveryAdapter;
  completions: AuthoritySignerCompletion[];
  completion: AuthorityCompletionEvidence | null;
  timeline: Array<{ at: number; method: string; url: string; tag: string }>;
};

export function createAuthoritySigningChainState(): AuthoritySigningChainState {
  return {
    packet: null,
    portablePacket: null,
    delivery: new RcDeliveryAdapter(),
    completions: [],
    completion: null,
    timeline: [],
  };
}

function parseSigningUrlParams(href: string): {
  counterpartyId: string;
  signerRoleId: string;
  agreementId: string;
  documentId: string;
  recipientEmail: string;
} {
  try {
    const u = new URL(href, "http://127.0.0.1:4173");
    return {
      counterpartyId: (u.searchParams.get("counterparty_id") ?? "").trim(),
      signerRoleId: (u.searchParams.get("signer_role_id") ?? "").trim(),
      agreementId: (u.searchParams.get("agreement_id") ?? "").trim(),
      documentId: (u.searchParams.get("document_id") ?? "").trim(),
      recipientEmail: (u.searchParams.get("recipient_email") ?? "").trim(),
    };
  } catch {
    return { counterpartyId: "", signerRoleId: "", agreementId: "", documentId: "", recipientEmail: "" };
  }
}

function isPortablePacketShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  const seed = p.seed as Record<string, unknown> | undefined;
  return (
    p.v === 1 &&
    Boolean(seed?.documentId && String(seed.documentId).trim()) &&
    Boolean(seed?.agreementId && String(seed.agreementId).trim()) &&
    Array.isArray(p.fields) &&
    Array.isArray(p.roles)
  );
}

function minimalPortablePacket(args: {
  agreementId: string;
  documentId: string;
  packetRevision: string;
  signerRoles: Array<{
    roleId: string;
    partyId: string;
    partyIndex: number;
    partyName: string;
    email: string;
    signerName?: string;
  }>;
}) {
  const fields = args.signerRoles.map((r, i) => ({
    id: `field_sig_${i}`,
    type: "signature" as const,
    counterpartyId: r.partyId,
    assignedSignerRoleId: r.roleId,
    assignedPartyIndex: r.partyIndex,
    page: 0,
    x: 0.1,
    y: 0.65 + i * 0.06,
    width: 0.35,
    height: 0.045,
  }));
  return {
    v: 1,
    seed: {
      v: 1,
      documentId: args.documentId,
      agreementId: args.agreementId,
      packetRevision: args.packetRevision,
    },
    fields,
    roles: args.signerRoles.map((r) => ({
      roleId: r.roleId,
      partyId: r.partyId,
      vs01CounterpartyId: r.partyId,
      partyIndex: r.partyIndex,
      partyName: r.partyName,
      entityName: r.partyName,
      signerEmail: r.email,
      signerName: r.signerName ?? r.partyName,
      requiresSignature: true,
      isEntityParty: true,
      kind: r.partyIndex === 0 ? "owner" : "party",
    })),
    pageCount: 1,
    witnessPageIndex: 0,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    fieldCount: fields.length,
  };
}

function resolveAuthorityPortablePacket(
  state: AuthoritySigningChainState,
  args: {
    agreementId: string;
    documentId: string;
    packetRevision: string;
    signerRoles: Array<{
      roleId: string;
      partyId: string;
      partyIndex: number;
      partyName: string;
      email: string;
      signerName?: string;
    }>;
  },
): Record<string, unknown> {
  if (state.portablePacket && isPortablePacketShape(state.portablePacket)) {
    const portable = { ...state.portablePacket };
    const seed = { ...(portable.seed as Record<string, unknown>) };
    seed.packetRevision = args.packetRevision;
    portable.seed = seed;
    return portable;
  }
  return minimalPortablePacket(args);
}

function minimalFrozenAuthority(args: {
  agreementId: string;
  partyIds: string[];
  signerIds: string[];
  emails: string[];
}) {
  return {
    version: 1,
    agreementId: args.agreementId,
    frozenCorpusHash: AUTHORITY_FROZEN_HASH,
    parties: args.partyIds.map((id, i) => ({
      agreementPartyId: id,
      legalEntityName: i === 0 ? "Red Mesa Logistics LLC" : "Harbor Peak Automation LLC",
      canonicalOrder: i,
    })),
    signers: args.signerIds.map((id, i) => ({
      signerRecordId: id,
      agreementPartyId: args.partyIds[i],
      signerEmail: args.emails[i],
      signingOrder: i,
      requiresSignature: true,
      requiresInitials: false,
    })),
    recipients: [],
    execution: {
      partyOrder: args.partyIds,
      signerOrder: args.signerIds,
      executionBlockHash: "exec_block_1",
    },
  };
}

export async function installAuthoritySigningChainRoutes(
  page: Page,
  state: AuthoritySigningChainState,
  args: {
    agreementId: string;
    partyCount?: number;
    signerEmails?: string[];
  },
): Promise<void> {
  const partyCount = args.partyCount ?? 2;
  const emails = args.signerEmails ?? ["sarah.mitchell@example.com", "michael.torres@example.com"];
  const partyIds = Array.from({ length: partyCount }, (_, i) => `party_${i + 1}`);
  const signerIds = Array.from({ length: partyCount }, (_, i) => `signer_${i + 1}`);
  const signerRoles = signerIds.map((id, i) => ({
    roleId: id,
    partyId: partyIds[i]!,
    partyIndex: i,
    partyName: i === 0 ? "Red Mesa Logistics LLC" : "Harbor Peak Automation LLC",
    email: emails[i] ?? `signer${i + 1}@example.com`,
    signerName: i === 0 ? "Sarah Mitchell" : "Michael Torres",
  }));
  const documentId = `doc_${args.agreementId}`;
  let generationCount = 0;

  const record = (method: string, url: string, tag: string) => {
    state.timeline.push({ at: Date.now(), method, url, tag });
  };

  const scope = page.context();

  await scope.route(`**/api/agreements/${encodeURIComponent(args.agreementId)}/vs01-signing-seed**`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    record("POST", route.request().url(), "vs01-signing-seed");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        document_id: documentId,
        content_sha256: `corpus:${AUTHORITY_FROZEN_HASH}`,
      }),
    });
  });

  await scope.route(`**/api/agreements/${encodeURIComponent(args.agreementId)}/frozen-signing-authority**`, async (route) => {
    const method = route.request().method();
    record(method, route.request().url(), "frozen-signing-authority");
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          snapshot: minimalFrozenAuthority({ agreementId: args.agreementId, partyIds, signerIds, emails }),
          status_counts: {
            legal_party_count: partyCount,
            signer_count: partyCount,
            required_signer_count: partyCount,
            invitation_count: state.delivery.signingMessages().length,
            required_action_count: partyCount,
          },
        }),
      });
      return;
    }
    if (method === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fallback();
  });

  await scope.route(`**/api/agreements/${encodeURIComponent(args.agreementId)}/signing-packet/reissue**`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    record("POST", route.request().url(), "signing-packet-reissue");
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.packet?.requestBodies.push(body);

    if (state.packet && generationCount > 0) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          packet_state: "active",
          packet_revision: state.packet.packetRevision,
          idempotent: true,
        }),
      });
      return;
    }

    generationCount += 1;
    const packetRevision = `rev_${args.agreementId}_${generationCount}`;
    const tokenFingerprints = signerIds.map((s) => `tok_fp_${s}`);
    state.packet = {
      packetId: `pkt_${args.agreementId}`,
      packetRevision,
      agreementId: args.agreementId,
      documentId,
      frozenSnapshotHash: AUTHORITY_FROZEN_HASH,
      signerIds,
      partyIds,
      tokenFingerprints,
      executionBlockCount: 1,
      generationCount,
      requestBodies: [body],
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        packet_state: "active",
        packet_revision: packetRevision,
        document_id: documentId,
      }),
    });
  });

  await scope.route(`**/api/agreements/${encodeURIComponent(args.agreementId)}/signing-links-sent**`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    record("POST", route.request().url(), "signing-links-sent");
    const body = route.request().postDataJSON() as {
      packet_revision?: string;
      document_id?: string;
      portable_packet?: Record<string, unknown>;
      frozen_signing_authority?: { frozenCorpusHash?: string };
      targets?: Array<{
        email: string;
        display_name: string;
        signing_url: string;
        signer_role_id: string;
        is_owner: boolean;
      }>;
    };
    const targets = body.targets ?? [];
    if (body.portable_packet && isPortablePacketShape(body.portable_packet)) {
      state.portablePacket = body.portable_packet;
    }
    if (!state.packet) {
      generationCount += 1;
      const packetRevision =
        (body.packet_revision ?? "").trim() || `rev_${args.agreementId}_${generationCount}`;
      state.packet = {
        packetId: `pkt_${args.agreementId}`,
        packetRevision,
        agreementId: args.agreementId,
        documentId: (body.document_id ?? "").trim() || documentId,
        frozenSnapshotHash:
          body.frozen_signing_authority?.frozenCorpusHash?.trim() || AUTHORITY_FROZEN_HASH,
        signerIds,
        partyIds,
        tokenFingerprints: targets.map((t) => tokenFingerprintFromHref(t.signing_url)),
        executionBlockCount: 1,
        generationCount,
        requestBodies: [body],
      };
    }
    for (const target of targets) {
      const urlParams = parseSigningUrlParams(target.signing_url);
      state.delivery.record({
        destination: target.email,
        templateType: "signing_invitation",
        agreementId: args.agreementId,
        packetId: state.packet?.packetId ?? null,
        signerId: target.signer_role_id || urlParams.signerRoleId,
        partyId: urlParams.counterpartyId || partyIds[0]!,
        linkType: "signing",
        tokenFingerprint: tokenFingerprintFromHref(target.signing_url),
        deliveryStatus: "sent",
        href: target.signing_url,
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        sent_count: targets.length,
        skip_reason: null,
      }),
    });
  });

  await scope.route(`**/api/agreements/${encodeURIComponent(args.agreementId)}/vs01-signer-complete**`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    record("POST", route.request().url(), "vs01-signer-complete");
    const body = route.request().postDataJSON() as {
      signer_role_id?: string;
      participant_id?: string;
      signed_at?: string;
    };
    const signerRoleId = String(body.signer_role_id ?? "").trim();
    const existing = state.completions.find((c) => c.signerRoleId === signerRoleId);
    if (!existing) {
      state.completions.push({
        signerRoleId,
        participantId: String(body.participant_id ?? signerRoleId),
        signedAt: body.signed_at ?? new Date().toISOString(),
      });
    }
    const allComplete = state.completions.length >= partyCount;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        already_signed: Boolean(existing),
        fully_executed: allComplete,
        completed_signers: state.completions.length,
        required_signers: partyCount,
        completion_emails_sent: allComplete,
      }),
    });
    if (allComplete && !state.completion) {
      state.completion = {
        artifactId: `art_${args.agreementId}`,
        executedHash: AUTHORITY_EXECUTED_HASH,
        frozenHash: AUTHORITY_FROZEN_HASH,
        ownerCounterFinal: `${partyCount}/${partyCount}`,
        completionEventCount: 1,
        signerCompletions: [...state.completions],
      };
    }
  });

  await scope.route(`**/api/agreements/${encodeURIComponent(args.agreementId)}/vs01-ensure-signed-snapshot**`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    record("POST", route.request().url(), "vs01-ensure-signed-snapshot");
    if (state.completions.length < partyCount) {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: "incomplete" }) });
      return;
    }
    state.completion = {
      artifactId: `art_${args.agreementId}`,
      executedHash: AUTHORITY_EXECUTED_HASH,
      frozenHash: AUTHORITY_FROZEN_HASH,
      ownerCounterFinal: `${partyCount}/${partyCount}`,
      completionEventCount: 1,
      signerCompletions: [...state.completions],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        snapshot_ready: true,
        snapshot_source: "vs01_authority",
        completion_emails_sent: true,
        artifact_id: state.completion.artifactId,
        executed_hash: state.completion.executedHash,
      }),
    });
  });

  await scope.route("**/api/agreements/access/policy**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    record("GET", route.request().url(), "access-policy");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recipient_link_token_required: false,
        mint_key_configured: false,
        signing_token_configured: false,
      }),
    });
  });

  await scope.route("**/api/agreements/access/validate**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    record("GET", route.request().url(), "access-validate");
    const reqUrl = new URL(route.request().url());
    const token = (reqUrl.searchParams.get("token") ?? "").trim();
    const agreementId = (reqUrl.searchParams.get("agreement_id") ?? args.agreementId).trim();
    const matched = state.delivery
      .signingMessages()
      .find((m) => token && m.href.includes(token));
    const partyId =
      matched?.partyId ??
      (matched ? parseSigningUrlParams(matched.href).counterpartyId : "") ??
      "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        agreement_id: agreementId,
        mode: "sign",
        locked_version_id: state.packet?.packetRevision ?? "rev_pending",
        recipient_party_id: partyId || null,
      }),
    });
  });

  await scope.route(`**/api/agreements/public/${encodeURIComponent(args.agreementId)}/vs01-signing-packet**`, async (route) => {
    record("GET", route.request().url(), "public-vs01-signing-packet");
    const rev = state.packet?.packetRevision ?? "rev_pending";
    const portable = resolveAuthorityPortablePacket(state, {
      agreementId: args.agreementId,
      documentId: state.packet?.documentId ?? documentId,
      packetRevision: rev,
      signerRoles,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ portable }),
    });
  });

  await scope.route(`**/api/agreements/public/${encodeURIComponent(args.agreementId)}/verify**`, async (route) => {
    record("GET", route.request().url(), "public-verify");
    if (!state.completion) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not_found" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        agreement_id: args.agreementId,
        artifact_id: state.completion.artifactId,
        packet_id: state.packet?.packetId ?? null,
        packet_revision: state.packet?.packetRevision ?? null,
        summary: {
          title: "Authority certification agreement",
          status: "executed",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        participants: state.completions.map((c, i) => ({
          name: emails[i] ?? `Signer ${i + 1}`,
          role: "signer",
        })),
        version_history: [],
        signature_status: {
          fully_executed: true,
          signatures_recorded: Math.min(state.completions.length, partyCount),
          signer_party_count: partyCount,
        },
        signature_events: state.completions.map((c) => ({
          event_type: "signature_completed",
          at: c.signedAt,
          signer_role_id: c.signerRoleId,
          participant_id: c.participantId,
          fully_executed: state.completions.length >= partyCount,
        })),
        verification: {
          agreement_hash: state.completion.executedHash,
          schema: "claw.agreement.public_verify/v1",
        },
      }),
    });
  });

  await scope.route("**/v1/documents/*/content**", async (route) => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
    await route.fulfill({ status: 200, contentType: "application/pdf", body: pdf });
  });
}

export async function installAuthoritySigningChainRoutesOnContext(
  context: BrowserContext,
  state: AuthoritySigningChainState,
  args: Parameters<typeof installAuthoritySigningChainRoutes>[2],
): Promise<void> {
  await context.route("**/api/agreements/**", async (route) => {
    const url = route.request().url();
    if (!url.includes(args.agreementId)) {
      await route.fallback();
      return;
    }
    await route.continue();
  });
}

export async function assertPacketAuthority(state: AuthoritySigningChainState): Promise<void> {
  expect(state.packet).not.toBeNull();
  expect(state.packet!.generationCount).toBe(1);
  expect(state.packet!.frozenSnapshotHash.trim().length).toBeGreaterThan(0);
  expect(state.packet!.executionBlockCount).toBe(1);
  expect(state.packet!.signerIds.length).toBeGreaterThanOrEqual(1);
  expect(state.packet!.partyIds.length).toBeGreaterThanOrEqual(1);
  state.delivery.assertDistinctTokenFingerprints();
}

export async function installAuthorityPublicVerifyRoutes(
  context: BrowserContext,
  state: AuthoritySigningChainState,
  args: { agreementId: string; partyCount?: number; signerEmails?: string[] },
): Promise<void> {
  const partyCount = args.partyCount ?? 2;
  const emails = args.signerEmails ?? ["sarah.mitchell@example.com", "michael.torres@example.com"];

  await context.route(`**/api/agreements/public/${encodeURIComponent(args.agreementId)}/verify**`, async (route) => {
    if (!state.completion) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not_found" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        agreement_id: args.agreementId,
        artifact_id: state.completion.artifactId,
        summary: {
          title: "Authority certification agreement",
          status: "executed",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        participants: state.completions.map((c, i) => ({
          name: emails[i] ?? `Signer ${i + 1}`,
          role: "signer",
        })),
        version_history: [],
        signature_status: {
          fully_executed: true,
          signatures_recorded: Math.min(state.completions.length, partyCount),
          signer_party_count: partyCount,
        },
        signature_events: state.completions.map((c) => ({
          event_type: "signature_completed",
          at: c.signedAt,
          signer_role_id: c.signerRoleId,
          participant_id: c.participantId,
        })),
        verification: {
          agreement_hash: state.completion.executedHash,
          schema: "claw.agreement.public_verify/v1",
        },
      }),
    });
  });

  await context.route("**/v1/documents/*/content**", async (route) => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
    await route.fulfill({ status: 200, contentType: "application/pdf", body: pdf });
  });
}

export async function openArtifactPublicVerification(
  browser: Browser,
  args: {
    agreementId: string;
    expectedArtifactId: string;
    chainState: AuthoritySigningChainState;
    partyCount?: number;
    signerEmails?: string[];
  },
): Promise<void> {
  const context = await browser.newContext();
  await installAuthorityPublicVerifyRoutes(context, args.chainState, {
    agreementId: args.agreementId,
    partyCount: args.partyCount,
    signerEmails: args.signerEmails,
  });
  const page = await context.newPage();
  try {
    await page.goto(agreementPublicVerifyPath(args.agreementId), { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Fully executed|fully signed|Record complete/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(new RegExp(args.agreementId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).first()).toBeVisible({
      timeout: 30_000,
    });
    const partyCount = args.partyCount ?? 2;
    await expect(
      page.getByText(new RegExp(`Signatures recorded:\\s*${partyCount}\\s*/\\s*${partyCount}`, "i")).first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Fully executed|fully signed|Record complete/i).first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.close();
  }
}

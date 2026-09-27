/**
 * Single post-auth path — server-authoritative when continuation_id is present.
 */

import type { User } from "@supabase/supabase-js";
import { bindAuthenticatedUserToWorkspace } from "./workspaceBindingApi";
import { refreshSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import { writeCurrentUserDisplayName } from "../account/currentUser";
import {
  clearAuthContinuationContext,
  readAuthContinuationContext,
} from "./authContinuationContext";
import { resolvePostAuthDestination, resolveServerAuthDestination } from "./safeRedirectResolver";
import { logProductEvent } from "../lib/experimentation/productEvents";
import {
  clearContinuationId,
  finalizeAuthOnServer,
  readContinuationId,
} from "./authContinuationApi";
import { getAuthSession } from "./supabaseAuthService";
import { getOrgId, setOrgId } from "../launch/orgContext";
import {
  readPaidCheckoutOrgId,
  resolveEntitlementRepairOrgCandidates,
} from "../launch/paidCheckoutOrgContext";
import { clearAnonymousSession, logAuthDiagnostic } from "./anonymousSessionApi";
import { commitPostAuthOwnershipMigration } from "./ownershipMigrationFinalize";
import { applyClaimedAgreementIdsToPreAuth } from "./preAuthCheckoutAgreement";
import { readCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";

export type PostAuthFinalizeResult = {
  destinationPath: string;
  orgId: string;
  migratedAgreementCount: number;
  migratedAgreementIds: string[];
  usedContinuation: boolean;
  usedFallback: boolean;
};

function agreementIdFromDestinationPath(dest: string | null | undefined): string | null {
  const raw = String(dest || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, "http://lawdog.local");
    const fromQuery = (url.searchParams.get("agreementId") || "").trim();
    if (fromQuery) return fromQuery;
    const fromPath = url.pathname.match(/\/app\/(?:done|create|send|checkout|ready)\/([^/]+)$/);
    return fromPath ? decodeURIComponent(fromPath[1]) : null;
  } catch {
    return null;
  }
}

function applyOwnershipMigrationFromServer(args: {
  migratedAgreementCount: number;
  migratedAgreementIds?: string[];
  continuationAgreementId?: string | null;
  destinationPath?: string | null;
}): void {
  const ids = (args.migratedAgreementIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (args.migratedAgreementCount <= 0 && ids.length === 0 && !args.continuationAgreementId && !args.destinationPath) {
    return;
  }
  applyClaimedAgreementIdsToPreAuth(ids);
  commitPostAuthOwnershipMigration({
    migratedAgreementIds: ids,
    continuationAgreementId:
      (args.continuationAgreementId || "").trim() || agreementIdFromDestinationPath(args.destinationPath),
    priorClientAgreementId: readCreateReviewAgreementResumeId(),
  });
}

export function displayNameFromUser(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : "";
  const trimmed = fromMeta.trim();
  if (trimmed) return trimmed;
  return user.email?.split("@")[0]?.trim() ?? "";
}

export async function finalizeAuthenticatedSession(args: {
  user: User;
  claimMethod: "magic_link" | "google" | "session_restore";
  continuationId?: string | null;
}): Promise<PostAuthFinalizeResult> {
  const display = displayNameFromUser(args.user);
  if (display) writeCurrentUserDisplayName(display);

  const continuationId = (args.continuationId ?? readContinuationId())?.trim() || null;
  const session = await getAuthSession();
  const accessToken = session?.access_token ?? "";

  if (continuationId && accessToken) {
    try {
      const server = await finalizeAuthOnServer({
        continuationId,
        accessToken,
        claimMethod: args.claimMethod,
        subscriptionSourceOrgId: readPaidCheckoutOrgId(),
        entitlementRepairCandidates: resolveEntitlementRepairOrgCandidates(),
      });
      setOrgId(server.org_id);
      const continuationAgreementId =
        readAuthContinuationContext()?.agreementId || agreementIdFromDestinationPath(server.destination_path);
      applyOwnershipMigrationFromServer({
        migratedAgreementCount: server.migrated_agreement_count,
        migratedAgreementIds: server.migrated_agreement_ids,
        continuationAgreementId,
        destinationPath: server.destination_path,
      });
      try {
        clearAnonymousSession();
        await refreshSubscriptionEntitlement();
        clearAuthContinuationContext();
        clearContinuationId();
        logProductEvent("authentication_completed", {
          claim_method: args.claimMethod,
          migrated_agreement_count: server.migrated_agreement_count,
          continuation_restored: true,
          continuation_fallback: false,
          server_authoritative: true,
        });
        if (server.migrated_agreement_count > 0) {
          logProductEvent("anonymous_draft_claim_completed", {
            claim_method: args.claimMethod,
            migrated_agreement_count: server.migrated_agreement_count,
          });
        }
        logProductEvent("continuation_restored", { surface: "server_finalize" });
      } catch {
        /* Secondary restore work must not undo a successful server finalize. */
      }
      return {
        destinationPath: resolveServerAuthDestination(server.destination_path, "/app"),
        orgId: String(server.org_id || "").trim(),
        migratedAgreementCount: server.migrated_agreement_count,
        migratedAgreementIds: server.migrated_agreement_ids ?? [],
        usedContinuation: true,
        usedFallback: false,
      };
    } catch (e) {
      logAuthDiagnostic("auth_finalize_failed", {
        reason: "finalize_failed",
      });
      logProductEvent("authentication_failed", {
        reason: "finalize_failed",
      });
      throw e;
    }
  }

  const bind = await bindAuthenticatedUserToWorkspace({
    userId: args.user.id,
    email: args.user.email,
    displayName: display,
    claimMethod: args.claimMethod,
    accessToken: accessToken || undefined,
  });

  if (bind.migrated_agreement_count > 0) {
    clearAnonymousSession();
  }
  await refreshSubscriptionEntitlement();

  const ctx = readAuthContinuationContext();
  const destinationPath = resolvePostAuthDestination(ctx);
  const usedContinuation = Boolean(ctx);
  const usedFallback = !ctx;

  clearAuthContinuationContext();
  clearContinuationId();

  logProductEvent("authentication_completed", {
    claim_method: args.claimMethod,
    migrated_agreement_count: bind.migrated_agreement_count,
    continuation_restored: usedContinuation,
    continuation_fallback: usedFallback,
  });

  if (bind.migrated_agreement_count > 0) {
    logProductEvent("anonymous_draft_claim_completed", {
      claim_method: args.claimMethod,
      migrated_agreement_count: bind.migrated_agreement_count,
    });
  }

  applyOwnershipMigrationFromServer({
    migratedAgreementCount: bind.migrated_agreement_count,
    migratedAgreementIds: bind.migrated_agreement_ids,
    continuationAgreementId: ctx?.agreementId,
  });

  return {
    destinationPath,
    orgId: String(bind.org_id || getOrgId()).trim(),
    migratedAgreementCount: bind.migrated_agreement_count,
    migratedAgreementIds: bind.migrated_agreement_ids ?? [],
    usedContinuation,
    usedFallback,
  };
}

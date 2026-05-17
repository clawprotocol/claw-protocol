import type { PlacedSigningField } from "./signingFields";
import type { Vs01RecipientPlacedField } from "./types";
import {
  evaluatePreparePacketGateFromRoles,
  findNextIncompletePrepareRole,
  findPrepareSigningRole,
  type SigningPacketPrepareGate,
  type Vs01PrepareSigningRole,
  vs01DiagnosticsEnabled,
} from "./vs01SignerFieldAssignment";

export type PrepareRoleSetReason =
  | "init"
  | "user_select"
  | "auto_advance"
  | "next_signer"
  | "sync";

export type PreparePlacementClickContext = {
  tool: string;
  page: number;
  /** UI-highlighted role id (parent React state); must match authority or placement blocks. */
  visualRoleId?: string | null;
};

export type PrepareRolePlacementResolution =
  | { ok: true; role: Vs01PrepareSigningRole; authorityRoleId: string }
  | { ok: false; reason: string };

/**
 * Mutable prepare-mode signer role authority. One instance per VS01 wizard session.
 * React state mirrors this for persistence only; never use props/closures for placement.
 */
export class Vs01PrepareRoleAuthority {
  private roles: Vs01PrepareSigningRole[] = [];
  private activeRoleId = "";
  /** After explicit user/controller set, parent prop must not overwrite authority. */
  private authorityLocked = false;

  setRoles(roles: Vs01PrepareSigningRole[]): void {
    this.roles = roles;
    const cur = this.activeRoleId.trim();
    if (cur && roles.some((r) => r.roleId === cur)) return;
    if (roles[0]) {
      this.activeRoleId = roles[0].roleId;
      this.authorityLocked = false;
    }
  }

  getRoles(): Vs01PrepareSigningRole[] {
    return this.roles;
  }

  getActiveRoleId(): string {
    return this.activeRoleId.trim();
  }

  getActiveRole(): Vs01PrepareSigningRole | null {
    return findPrepareSigningRole(this.roles, this.activeRoleId);
  }

  getOwnerRole(): Vs01PrepareSigningRole | null {
    return this.roles[0] ?? null;
  }

  setActiveRole(
    roleId: string,
    reason: PrepareRoleSetReason,
    onParentSync?: (id: string) => void,
  ): boolean {
    const id = roleId.trim();
    const role = findPrepareSigningRole(this.roles, id);
    if (!role) return false;
    const prev = this.activeRoleId;
    this.activeRoleId = role.roleId;
    if (reason !== "init" && reason !== "sync") {
      this.authorityLocked = true;
    }
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-active-role-set]", {
        reason,
        partyIndex: role.partyIndex,
        partyId: role.partyId,
        roleKind: role.kind,
        roleIdShort: role.roleId.slice(0, 16),
        prevRoleIdShort: prev.trim() ? prev.trim().slice(0, 16) : null,
      });
    }
    onParentSync?.(role.roleId);
    return true;
  }

  /**
   * Initialize from persisted parent id only when authority is empty/invalid and not user-locked.
   */
  syncFromParentProp(propRoleId: string | undefined, onParentSync?: (id: string) => void): void {
    if (!this.roles.length) return;
    const cur = this.activeRoleId.trim();
    if (this.authorityLocked && cur && this.roles.some((r) => r.roleId === cur)) {
      return;
    }
    const fromProp = (propRoleId ?? "").trim();
    const pick =
      fromProp && this.roles.some((r) => r.roleId === fromProp)
        ? fromProp
        : this.roles[0]!.roleId;
    if (pick === cur) return;
    this.setActiveRole(pick, "sync", onParentSync);
  }

  resolveRoleForPlacement(ctx: PreparePlacementClickContext): PrepareRolePlacementResolution {
    if (!this.roles.length) {
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-prepare-field-rejected]", { reason: "no_roles", tool: ctx.tool });
      }
      return { ok: false, reason: "no_roles" };
    }
    const authorityId = this.getActiveRoleId();
    if (!authorityId) {
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-prepare-field-rejected]", { reason: "empty_authority_role", tool: ctx.tool });
      }
      return { ok: false, reason: "empty_authority_role" };
    }
    const role = findPrepareSigningRole(this.roles, authorityId);
    if (!role) {
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-prepare-field-rejected]", {
          reason: "authority_role_not_found",
          tool: ctx.tool,
          roleIdShort: authorityId.slice(0, 16),
        });
      }
      return { ok: false, reason: "authority_role_not_found" };
    }
    const visual = (ctx.visualRoleId ?? "").trim();
    if (visual && visual !== authorityId) {
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-role-authority-mismatch]", {
          tool: ctx.tool,
          page: ctx.page,
          authorityRoleIdShort: authorityId.slice(0, 16),
          visualRoleIdShort: visual.slice(0, 16),
          note: "authority_wins",
        });
      }
    }
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-placement-click-role]", {
        tool: ctx.tool,
        page: ctx.page,
        partyIndex: role.partyIndex,
        partyId: role.partyId,
        roleKind: role.kind,
        roleIdShort: role.roleId.slice(0, 16),
        visualRoleIdShort: visual ? visual.slice(0, 16) : null,
      });
    }
    return { ok: true, role, authorityRoleId: authorityId };
  }

  evaluateProgress(
    senderFields: PlacedSigningField[],
    recipientFields: Vs01RecipientPlacedField[],
  ): SigningPacketPrepareGate {
    return evaluatePreparePacketGateFromRoles(this.roles, senderFields, recipientFields);
  }

  logRoleProgress(
    gate: SigningPacketPrepareGate,
    senderFields: PlacedSigningField[],
    recipientFields: Vs01RecipientPlacedField[],
  ): void {
    if (!vs01DiagnosticsEnabled()) return;
    // eslint-disable-next-line no-console
    console.info("[vs01-role-progress]", {
      canFinish: gate.canFinish,
      activeRoleIdShort: this.getActiveRoleId().slice(0, 16),
      senderCount: senderFields.length,
      recipientCount: recipientFields.length,
      roles: this.roles.map((r) => ({
        label: r.entityName,
        partyIndex: r.partyIndex,
        missing: gate.missingByParty[r.roleId] ?? [],
        tally: gate.fieldsByRole[r.roleId],
      })),
    });
  }

  advanceToNextIncompleteRole(
    senderFields: PlacedSigningField[],
    recipientFields: Vs01RecipientPlacedField[],
    reason: PrepareRoleSetReason,
    onParentSync?: (id: string) => void,
  ): Vs01PrepareSigningRole | null {
    const gate = this.evaluateProgress(senderFields, recipientFields);
    this.logRoleProgress(gate, senderFields, recipientFields);
    const curId = this.getActiveRoleId();
    const curIdx = Math.max(
      0,
      this.roles.findIndex((r) => r.roleId === curId),
    );

    let pick: Vs01PrepareSigningRole | null = null;

    if (reason === "next_signer") {
      for (let i = 1; i <= this.roles.length; i++) {
        const r = this.roles[(curIdx + i) % this.roles.length]!;
        if ((gate.missingByParty[r.roleId]?.length ?? 0) > 0) {
          pick = r;
          break;
        }
      }
    } else {
      const curMiss = gate.missingByParty[curId];
      if (curMiss?.length) return null;
      pick = findNextIncompletePrepareRole(this.roles, gate);
    }

    if (!pick || pick.roleId === curId) return null;
    this.setActiveRole(pick.roleId, reason, onParentSync);
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-auto-advance-role]", {
        reason,
        fromRoleIdShort: curId.slice(0, 16),
        toRoleIdShort: pick.roleId.slice(0, 16),
        partyIndex: pick.partyIndex,
      });
    }
    return pick;
  }

  /**
   * Logs placement progress only — never changes active signer.
   * Role changes are explicit: user picker, “Next signer”, missing-field “Go to”, or continue-blocked focus.
   */
  afterPlacement(
    senderFields: PlacedSigningField[],
    recipientFields: Vs01RecipientPlacedField[],
    _onParentSync?: (id: string) => void,
  ): void {
    const gate = this.evaluateProgress(senderFields, recipientFields);
    this.logRoleProgress(gate, senderFields, recipientFields);
  }
}

export function createVs01PrepareRoleAuthority(): Vs01PrepareRoleAuthority {
  return new Vs01PrepareRoleAuthority();
}

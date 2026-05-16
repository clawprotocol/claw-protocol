import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import {
  findPrepareSigningRole,
  logVs01ActiveRoleChange,
  vs01DiagnosticsEnabled,
} from "./vs01SignerFieldAssignment";

export type UseVs01PrepareActiveRoleArgs = {
  prepareSignerRoles?: Vs01PrepareSigningRole[];
  /** Parent-controlled id for sidebar highlight; placement uses ref only. */
  prepareActiveSignerRoleId?: string;
  onPrepareActiveSignerRoleChange?: (roleId: string) => void;
};

/**
 * Synchronous active signer role for prepare_signing_packet placement.
 * The ref is authoritative at click time; parent state is for UI only and must not stomp a fresher ref.
 */
export function useVs01PrepareActiveRole({
  prepareSignerRoles,
  prepareActiveSignerRoleId,
  onPrepareActiveSignerRoleChange,
}: UseVs01PrepareActiveRoleArgs) {
  const rolesRef = useRef(prepareSignerRoles);
  rolesRef.current = prepareSignerRoles;

  const activeRoleIdRef = useRef("");

  useLayoutEffect(() => {
    const roles = rolesRef.current;
    if (!roles?.length) return;
    const cur = activeRoleIdRef.current.trim();
    if (cur && roles.some((r) => r.roleId === cur)) return;
    const fromProp = (prepareActiveSignerRoleId ?? "").trim();
    const pick =
      fromProp && roles.some((r) => r.roleId === fromProp) ? fromProp : roles[0]!.roleId;
    activeRoleIdRef.current = pick;
  }, [prepareSignerRoles, prepareActiveSignerRoleId]);

  const activePrepareRole = useMemo(
    () =>
      findPrepareSigningRole(
        prepareSignerRoles,
        (prepareActiveSignerRoleId ?? "").trim() || activeRoleIdRef.current,
      ),
    [prepareSignerRoles, prepareActiveSignerRoleId],
  );

  const ownerPrepareRole = useMemo(
    () => (prepareSignerRoles?.length ? prepareSignerRoles[0]! : null),
    [prepareSignerRoles],
  );

  const selectPrepareRole = useCallback(
    (roleId: string) => {
      const id = roleId.trim();
      if (!id) return;
      const prevId = activeRoleIdRef.current;
      activeRoleIdRef.current = id;
      const role = findPrepareSigningRole(rolesRef.current, id);
      if (role) logVs01ActiveRoleChange(role, prevId);
      onPrepareActiveSignerRoleChange?.(id);
    },
    [onPrepareActiveSignerRoleChange],
  );

  const resolveRoleAtPlacement = useCallback((): Vs01PrepareSigningRole | null => {
    const roles = rolesRef.current;
    if (!roles?.length) {
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-placement-role-missing]", { reason: "no_roles" });
      }
      return null;
    }
    const id = activeRoleIdRef.current.trim();
    if (!id) {
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-placement-role-missing]", { reason: "empty_active_role_ref" });
      }
      return null;
    }
    const role = findPrepareSigningRole(roles, id);
    if (!role) {
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-placement-role-missing]", {
          reason: "role_not_in_list",
          roleIdShort: id.slice(0, 16),
        });
      }
      return null;
    }
    const visualId = (prepareActiveSignerRoleId ?? "").trim();
    if (visualId && visualId !== id) {
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-field-assignment-mismatch]", {
          reason: "visual_role_lags_ref",
          refRoleIdShort: id.slice(0, 16),
          visualRoleIdShort: visualId.slice(0, 16),
        });
      }
    }
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-placement-click-role]", {
        partyIndex: role.partyIndex,
        partyId: role.partyId,
        roleKind: role.kind,
        roleIdShort: role.roleId.slice(0, 16),
      });
    }
    return role;
  }, [prepareActiveSignerRoleId]);

  return {
    rolesRef,
    activeRoleIdRef,
    activePrepareRole,
    ownerPrepareRole,
    selectPrepareRole,
    resolveRoleAtPlacement,
  };
}

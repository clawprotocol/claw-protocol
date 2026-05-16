import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01RecipientPlacedField } from "./types";
import {
  createVs01PrepareRoleAuthority,
  Vs01PrepareRoleAuthority,
  type PrepareRoleSetReason,
} from "./vs01PrepareRoleAuthority";
import {
  findPrepareSigningRole,
  placedFieldMatchesPrepareRole,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";

export type Vs01PrepareRoleAuthorityContextValue = {
  authority: Vs01PrepareRoleAuthority;
  /** Role id used for sidebar highlight — always matches placement authority. */
  displayRoleId: string;
  activeRole: Vs01PrepareSigningRole | null;
  ownerRole: Vs01PrepareSigningRole | null;
  setActiveRole: (roleId: string, reason?: PrepareRoleSetReason) => void;
  advanceToNextSigner: (
    senderFields: PlacedSigningField[],
    recipientFields: Vs01RecipientPlacedField[],
  ) => void;
  afterPlacement: (
    senderFields: PlacedSigningField[],
    recipientFields: Vs01RecipientPlacedField[],
  ) => void;
  fieldMatchesActiveRole: (
    field: { assignedSignerRoleId?: string },
  ) => boolean;
};

const Ctx = createContext<Vs01PrepareRoleAuthorityContextValue | null>(null);

export function Vs01PrepareRoleAuthorityProvider({
  children,
  prepareSignerRoles,
  prepareActiveSignerRoleId,
  onPrepareActiveSignerRoleChange,
}: {
  children: ReactNode;
  prepareSignerRoles?: Vs01PrepareSigningRole[];
  prepareActiveSignerRoleId?: string;
  onPrepareActiveSignerRoleChange?: (roleId: string) => void;
}) {
  const authorityRef = useRef<Vs01PrepareRoleAuthority | null>(null);
  if (!authorityRef.current) {
    authorityRef.current = createVs01PrepareRoleAuthority();
  }
  const authority = authorityRef.current;

  const [, bump] = useReducer((n: number) => n + 1, 0);
  const onSyncRef = useRef(onPrepareActiveSignerRoleChange);
  onSyncRef.current = onPrepareActiveSignerRoleChange;

  const parentSync = useCallback((id: string) => {
    onSyncRef.current?.(id);
    bump();
  }, []);

  useLayoutEffect(() => {
    if (prepareSignerRoles?.length) {
      authority.setRoles(prepareSignerRoles);
    }
    authority.syncFromParentProp(prepareActiveSignerRoleId, parentSync);
  }, [prepareSignerRoles, prepareActiveSignerRoleId, authority, parentSync]);

  const displayRoleId = authority.getActiveRoleId();
  const activeRole = findPrepareSigningRole(prepareSignerRoles, displayRoleId);
  const ownerRole = prepareSignerRoles?.[0] ?? null;

  const setActiveRole = useCallback(
    (roleId: string, reason: PrepareRoleSetReason = "user_select") => {
      authority.setActiveRole(roleId, reason, parentSync);
    },
    [authority, parentSync],
  );

  const advanceToNextSigner = useCallback(
    (senderFields: PlacedSigningField[], recipientFields: Vs01RecipientPlacedField[]) => {
      authority.advanceToNextIncompleteRole(
        senderFields,
        recipientFields,
        "next_signer",
        parentSync,
      );
    },
    [authority, parentSync],
  );

  const afterPlacement = useCallback(
    (senderFields: PlacedSigningField[], recipientFields: Vs01RecipientPlacedField[]) => {
      authority.afterPlacement(senderFields, recipientFields, parentSync);
    },
    [authority, parentSync],
  );

  const fieldMatchesActiveRole = useCallback(
    (field: { assignedSignerRoleId?: string }) => {
      if (!ownerRole || !displayRoleId) return true;
      return placedFieldMatchesPrepareRole(field, displayRoleId, ownerRole);
    },
    [ownerRole, displayRoleId],
  );

  const value = useMemo(
    (): Vs01PrepareRoleAuthorityContextValue => ({
      authority,
      displayRoleId,
      activeRole,
      ownerRole,
      setActiveRole,
      advanceToNextSigner,
      afterPlacement,
      fieldMatchesActiveRole,
    }),
    [
      authority,
      displayRoleId,
      activeRole,
      ownerRole,
      setActiveRole,
      advanceToNextSigner,
      afterPlacement,
      fieldMatchesActiveRole,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVs01PrepareRoleAuthority(): Vs01PrepareRoleAuthorityContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useVs01PrepareRoleAuthority requires Vs01PrepareRoleAuthorityProvider");
  }
  return v;
}

/** Optional hook when provider is absent (non-prepare flows). */
export function useVs01PrepareRoleAuthorityOptional(): Vs01PrepareRoleAuthorityContextValue | null {
  return useContext(Ctx);
}

import { useEffect, useState } from "react";
import {
  PREPARE_PACKET_INITIALS_TOGGLE_HINT,
  PREPARE_PACKET_INITIALS_TOGGLE_LABEL,
} from "./vs01PreparePacketCompletion";
import {
  readVs01SigningPackagePreferences,
  writeVs01SigningPackagePreferences,
} from "./vs01SigningPackagePreferences";

type Props = {
  agreementId: string;
};

export function Vs01SigningPackageInitialsPreference({ agreementId }: Props) {
  const id = agreementId.trim();
  const [autoInitialsEveryPage, setAutoInitialsEveryPage] = useState(
    () => readVs01SigningPackagePreferences(id)?.autoInitialsEveryPage ?? false,
  );

  useEffect(() => {
    if (!id) return;
    writeVs01SigningPackagePreferences(id, { autoInitialsEveryPage });
  }, [autoInitialsEveryPage, id]);

  if (!id) return null;

  return (
    <div
      className="mt-5 rounded-xl border border-slate-700/45 bg-slate-900/35 px-4 py-4"
      data-testid="signing-package-initials-preference"
    >
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={autoInitialsEveryPage}
          onChange={(event) => setAutoInitialsEveryPage(event.target.checked)}
          data-testid="signing-package-initials-toggle"
        />
        <span>
          <span className="font-medium text-slate-100">{PREPARE_PACKET_INITIALS_TOGGLE_LABEL}</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-400">
            {PREPARE_PACKET_INITIALS_TOGGLE_HINT}
          </span>
        </span>
      </label>
    </div>
  );
}

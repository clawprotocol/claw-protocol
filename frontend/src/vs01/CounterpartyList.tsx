import type { Vs01Counterparty } from "./types";

export type CounterpartyListProps = {
  counterparties: Vs01Counterparty[];
  onChange: (next: Vs01Counterparty[]) => void;
  disabled?: boolean;
};

function newSignerRow(): Vs01Counterparty {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return { id, name: "", email: "", phone: "" };
}

function isSignerRowBlank(c: Vs01Counterparty): boolean {
  const phone = c.phone ?? "";
  return !c.name.trim() && !c.email.trim() && !phone.trim();
}

/**
 * Editable other-signer rows: name, optional email, optional phone.
 */
export function CounterpartyList({ counterparties, onChange, disabled }: CounterpartyListProps) {
  const hasBlankRow = counterparties.some(isSignerRowBlank);

  const update = (id: string, patch: Partial<Pick<Vs01Counterparty, "name" | "email" | "phone">>) => {
    onChange(
      counterparties.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const add = () => {
    if (hasBlankRow) return;
    onChange([...counterparties, newSignerRow()]);
  };

  const remove = (id: string) => {
    if (counterparties.length <= 1) return;
    onChange(counterparties.filter((c) => c.id !== id));
  };

  return (
    <div className="vs01-counterparty-block vs01-stack">
      <h3 className="vs01-details-section-title" id="vs01-cp-heading">
        Other signers
      </h3>
      <p className="vs01-subtle-hint" id="vs01-cp-hint">
        Add each person who should sign after you. Email or text is optional for now.
      </p>
      {counterparties.map((c) => (
        <div key={c.id} className="vs01-counterparty-row">
          <div className="vs01-field">
            <label className="vs01-subfield-label" htmlFor={`vs01-cp-name-${c.id}`}>
              Name
            </label>
            <input
              id={`vs01-cp-name-${c.id}`}
              className="vs01-input"
              value={c.name}
              disabled={disabled}
              placeholder="Jamie Chen"
              autoComplete="name"
              onChange={(ev) => update(c.id, { name: ev.target.value })}
              aria-describedby="vs01-cp-hint"
            />
          </div>
          <div className="vs01-field">
            <label className="vs01-subfield-label" htmlFor={`vs01-cp-email-${c.id}`}>
              Email (optional)
            </label>
            <input
              id={`vs01-cp-email-${c.id}`}
              className="vs01-input"
              type="email"
              value={c.email}
              disabled={disabled}
              placeholder="jamie@…"
              autoComplete="email"
              onChange={(ev) => update(c.id, { email: ev.target.value })}
            />
          </div>
          <div className="vs01-field">
            <label className="vs01-subfield-label" htmlFor={`vs01-cp-phone-${c.id}`}>
              Mobile / text number (optional)
            </label>
            <input
              id={`vs01-cp-phone-${c.id}`}
              className="vs01-input"
              type="tel"
              value={c.phone ?? ""}
              disabled={disabled}
              placeholder="(555) 123-4567"
              autoComplete="tel"
              onChange={(ev) => update(c.id, { phone: ev.target.value })}
            />
          </div>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--row-action"
            disabled={disabled || counterparties.length <= 1}
            onClick={() => remove(c.id)}
            aria-label="Remove this signer"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="vs01-btn vs01-btn--secondary vs01-btn--add-signer"
        disabled={disabled || hasBlankRow}
        onClick={add}
        title={
          hasBlankRow
            ? "Fill in the empty row or remove it before adding another signer"
            : undefined
        }
      >
        Add another signer
      </button>
    </div>
  );
}

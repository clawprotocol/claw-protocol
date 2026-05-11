/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useState, useRef, useEffect } from "react";
import type { PlacedSigningField } from "./signingFields";

/**
 * Minimal harness that replicates the field-sync guard logic from StepPrepareSignature
 * without mounting the full component (which requires PDF/canvas/sign-session mocks).
 */
function FieldSyncHarness(props: {
  initialFields?: PlacedSigningField[];
  onFieldsChange?: (fields: PlacedSigningField[]) => void;
}) {
  const { initialFields, onFieldsChange } = props;
  const [fields, setFields] = useState<PlacedSigningField[]>(() => initialFields ?? []);
  const onFieldsChangeRef = useRef(onFieldsChange);
  onFieldsChangeRef.current = onFieldsChange;

  const fieldInitConfirmedRef = useRef(
    (initialFields && initialFields.length > 0) ? true : false,
  );
  const prevInitialFieldsLenRef = useRef(initialFields?.length ?? 0);

  useEffect(() => {
    const prevLen = prevInitialFieldsLenRef.current;
    const nextLen = initialFields?.length ?? 0;
    prevInitialFieldsLenRef.current = nextLen;

    if (nextLen > 0 && prevLen === 0) {
      fieldInitConfirmedRef.current = true;
      setFields((prev) => (prev.length === 0 ? initialFields! : prev));
    }
  }, [initialFields]);

  useEffect(() => {
    if (!fieldInitConfirmedRef.current && fields.length === 0) return;
    fieldInitConfirmedRef.current = true;
    onFieldsChangeRef.current?.(fields);
  }, [fields]);

  return (
    <div data-testid="field-count">{fields.length}</div>
  );
}

function makePlacedField(id: string): PlacedSigningField {
  return { id, type: "signature", page: 0, x: 0.2, y: 0.3, width: 0.21, height: 0.046 };
}

describe("StepPrepareSignature field sync guard", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does NOT emit onFieldsChange([]) on mount when initialFields is empty", () => {
    const onChange = vi.fn();
    render(<FieldSyncHarness initialFields={[]} onFieldsChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does NOT emit onFieldsChange([]) on mount when initialFields is undefined", () => {
    const onChange = vi.fn();
    render(<FieldSyncHarness onFieldsChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits onFieldsChange with initial fields when initialFields is non-empty", () => {
    const fields = [makePlacedField("f1"), makePlacedField("f2")];
    const onChange = vi.fn();
    render(<FieldSyncHarness initialFields={fields} onFieldsChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(fields);
  });

  it("syncs from initialFields when prop changes from empty to non-empty (async hydration)", () => {
    const onChange = vi.fn();
    const { rerender, getByTestId } = render(
      <FieldSyncHarness initialFields={[]} onFieldsChange={onChange} />,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(getByTestId("field-count").textContent).toBe("0");

    const fields = [makePlacedField("f1"), makePlacedField("f2"), makePlacedField("f3")];
    act(() => {
      rerender(<FieldSyncHarness initialFields={fields} onFieldsChange={onChange} />);
    });

    expect(getByTestId("field-count").textContent).toBe("3");
    expect(onChange).toHaveBeenCalledWith(fields);
  });

  it("does NOT overwrite non-empty local fields with empty initialFields", () => {
    const fields = [makePlacedField("f1"), makePlacedField("f2")];
    const onChange = vi.fn();
    const { rerender, getByTestId } = render(
      <FieldSyncHarness initialFields={fields} onFieldsChange={onChange} />,
    );
    expect(getByTestId("field-count").textContent).toBe("2");

    act(() => {
      rerender(<FieldSyncHarness initialFields={[]} onFieldsChange={onChange} />);
    });
    expect(getByTestId("field-count").textContent).toBe("2");
  });
});

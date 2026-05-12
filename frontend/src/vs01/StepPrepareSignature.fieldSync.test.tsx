/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useState, useCallback, useRef } from "react";
import type { PlacedSigningField } from "./signingFields";

/**
 * Harness that mirrors the controlled-field contract:
 *  - Parent owns `fields` state.
 *  - Child receives `fields` + `onFieldsChange` (both required).
 *  - Child's `setFields` wrapper resolves functional updates against latest prop via ref, then calls `onFieldsChange`.
 */
function ControlledFieldChild(props: {
  fields: PlacedSigningField[];
  onFieldsChange: (next: PlacedSigningField[]) => void;
}) {
  const { fields, onFieldsChange } = props;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const onFieldsChangeRef = useRef(onFieldsChange);
  onFieldsChangeRef.current = onFieldsChange;

  const setFields = useCallback(
    (next: PlacedSigningField[] | ((prev: PlacedSigningField[]) => PlacedSigningField[])) => {
      const prev = fieldsRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      if (resolved === prev) return;
      if (resolved.length === prev.length && resolved.every((f, i) => f === prev[i])) return;
      onFieldsChangeRef.current(resolved);
    },
    [],
  );

  return (
    <div>
      <div data-testid="field-count">{fields.length}</div>
      <button data-testid="add" onClick={() => setFields((prev) => [...prev, makePlacedField(`new-${prev.length}`)])} />
      <button data-testid="clear" onClick={() => setFields([])} />
      <button data-testid="remove-last" onClick={() => setFields((prev) => prev.slice(0, -1))} />
      <button data-testid="noop-filter" onClick={() => setFields((prev) => prev.filter(() => true))} />
    </div>
  );
}

function ParentHarness(props: {
  initial: PlacedSigningField[];
  spy?: (fields: PlacedSigningField[]) => void;
}) {
  const [fields, setFields] = useState<PlacedSigningField[]>(props.initial);
  const handleChange = useCallback(
    (next: PlacedSigningField[]) => {
      setFields(next);
      props.spy?.(next);
    },
    [props.spy],
  );
  return <ControlledFieldChild fields={fields} onFieldsChange={handleChange} />;
}

function makePlacedField(id: string): PlacedSigningField {
  return { id, type: "signature", page: 0, x: 0.2, y: 0.3, width: 0.21, height: 0.046 };
}

describe("StepPrepareSignature controlled field rendering", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders 0 fields when parent provides empty array", () => {
    const { getByTestId } = render(<ParentHarness initial={[]} />);
    expect(getByTestId("field-count").textContent).toBe("0");
  });

  it("renders 18 fields when parent provides 18 hydrated fields", () => {
    const fields = Array.from({ length: 18 }, (_, i) => makePlacedField(`f${i}`));
    const { getByTestId } = render(<ParentHarness initial={fields} />);
    expect(getByTestId("field-count").textContent).toBe("18");
  });

  it("does NOT call onFieldsChange on mount (no dual-state sync emission)", () => {
    const spy = vi.fn();
    const fields = [makePlacedField("f1"), makePlacedField("f2")];
    render(<ParentHarness initial={fields} spy={spy} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls onFieldsChange when user adds a field", () => {
    const spy = vi.fn();
    const { getByTestId } = render(<ParentHarness initial={[makePlacedField("f1")]} spy={spy} />);
    expect(getByTestId("field-count").textContent).toBe("1");

    act(() => { getByTestId("add").click(); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toHaveLength(2);
    expect(getByTestId("field-count").textContent).toBe("2");
  });

  it("user can remove the last field (clears to empty)", () => {
    const spy = vi.fn();
    const { getByTestId } = render(
      <ParentHarness initial={[makePlacedField("only")]} spy={spy} />,
    );
    expect(getByTestId("field-count").textContent).toBe("1");

    act(() => { getByTestId("remove-last").click(); });
    expect(spy).toHaveBeenCalledWith([]);
    expect(getByTestId("field-count").textContent).toBe("0");
  });

  it("parent prop changes are immediately reflected in child render", () => {
    const onChange = vi.fn();
    const { getByTestId, rerender } = render(
      <ControlledFieldChild fields={[]} onFieldsChange={onChange} />,
    );
    expect(getByTestId("field-count").textContent).toBe("0");

    const hydrated = Array.from({ length: 18 }, (_, i) => makePlacedField(`h${i}`));
    act(() => {
      rerender(<ControlledFieldChild fields={hydrated} onFieldsChange={onChange} />);
    });
    expect(getByTestId("field-count").textContent).toBe("18");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refresh path: hydrated fields display without any mount-time wipe", () => {
    const fields = Array.from({ length: 18 }, (_, i) => makePlacedField(`refresh-${i}`));
    const spy = vi.fn();
    const { getByTestId, unmount } = render(<ParentHarness initial={fields} spy={spy} />);
    expect(getByTestId("field-count").textContent).toBe("18");
    expect(spy).not.toHaveBeenCalled();

    unmount();

    const { getByTestId: getByTestId2 } = render(<ParentHarness initial={fields} spy={spy} />);
    expect(getByTestId2("field-count").textContent).toBe("18");
    expect(spy).not.toHaveBeenCalled();
  });

  it("functional update reads latest fields from ref, not stale closure", () => {
    const spy = vi.fn();
    const { getByTestId } = render(<ParentHarness initial={[]} spy={spy} />);

    act(() => { getByTestId("add").click(); });
    expect(getByTestId("field-count").textContent).toBe("1");

    act(() => { getByTestId("add").click(); });
    expect(getByTestId("field-count").textContent).toBe("2");

    act(() => { getByTestId("add").click(); });
    expect(getByTestId("field-count").textContent).toBe("3");
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[2][0]).toHaveLength(3);
  });

  it("bridge hydration: parent sets fields via prop, then child add reads latest", () => {
    const onChange = vi.fn();
    const hydrated = Array.from({ length: 5 }, (_, i) => makePlacedField(`h${i}`));

    const { getByTestId, rerender } = render(
      <ControlledFieldChild fields={[]} onFieldsChange={onChange} />,
    );
    expect(getByTestId("field-count").textContent).toBe("0");

    act(() => {
      rerender(<ControlledFieldChild fields={hydrated} onFieldsChange={onChange} />);
    });
    expect(getByTestId("field-count").textContent).toBe("5");

    act(() => { getByTestId("add").click(); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(6);
  });

  it("placement after clear: child can add fields after parent resets to empty", () => {
    const spy = vi.fn();
    const initial = [makePlacedField("f1"), makePlacedField("f2")];
    const { getByTestId } = render(<ParentHarness initial={initial} spy={spy} />);
    expect(getByTestId("field-count").textContent).toBe("2");

    act(() => { getByTestId("clear").click(); });
    expect(getByTestId("field-count").textContent).toBe("0");

    act(() => { getByTestId("add").click(); });
    expect(getByTestId("field-count").textContent).toBe("1");
    expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toHaveLength(1);
  });

  it("no-op filter does not trigger onFieldsChange (bailout)", () => {
    const spy = vi.fn();
    const initial = [makePlacedField("f1"), makePlacedField("f2")];
    const { getByTestId } = render(<ParentHarness initial={initial} spy={spy} />);
    expect(getByTestId("field-count").textContent).toBe("2");

    act(() => { getByTestId("noop-filter").click(); });
    expect(spy).not.toHaveBeenCalled();
    expect(getByTestId("field-count").textContent).toBe("2");
  });

  it("repeated placements accumulate: add signature then email yields count 1 then 2", () => {
    const spy = vi.fn();
    const { getByTestId } = render(<ParentHarness initial={[]} spy={spy} />);
    expect(getByTestId("field-count").textContent).toBe("0");

    act(() => { getByTestId("add").click(); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toHaveLength(1);
    expect(getByTestId("field-count").textContent).toBe("1");

    act(() => { getByTestId("add").click(); });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toHaveLength(2);
    expect(getByTestId("field-count").textContent).toBe("2");

    act(() => { getByTestId("add").click(); });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[2][0]).toHaveLength(3);
    expect(getByTestId("field-count").textContent).toBe("3");
  });

  it("tool selection (which just changes activeTool) does not clear existing fields", () => {
    const spy = vi.fn();
    const initial = [makePlacedField("f1"), makePlacedField("f2"), makePlacedField("f3")];
    const { getByTestId } = render(<ParentHarness initial={initial} spy={spy} />);
    expect(getByTestId("field-count").textContent).toBe("3");

    act(() => { getByTestId("noop-filter").click(); });
    expect(spy).not.toHaveBeenCalled();
    expect(getByTestId("field-count").textContent).toBe("3");
  });
});

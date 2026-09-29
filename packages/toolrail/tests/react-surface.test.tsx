import { act, render, renderHook } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { describe, expect, it } from "vitest";
import { defineSurface, StrictModelContext, type SurfaceTool } from "../src";
import { useCommittedDispatch, useToolSurface } from "../src/react";

interface WizardState {
  readonly step: 1 | 2 | 3;
}

const build = defineSurface<WizardState>((state) => {
  const tools: SurfaceTool[] = [{ name: "describe_step", mode: "READ", description: "Describe the step.", execute: () => `step ${state.step}` }];
  if (state.step < 3) tools.push({ name: "go_next", mode: "ACT", description: "Advance one step.", execute: () => "ok" });
  if (state.step === 3) tools.push({ name: "submit", mode: "ACT", description: "Submit the form.", execute: () => "sent" });
  return tools;
});

function Wizard({ context, initial }: { context: StrictModelContext; initial: WizardState["step"] }) {
  const [step, setStep] = useState<WizardState["step"]>(initial);
  const status = useToolSurface({ step }, build, { modelContext: context });
  return (
    <div>
      <output data-testid="registered">{status.registered.join(",")}</output>
      <button onClick={() => setStep((current) => (current < 3 ? ((current + 1) as WizardState["step"]) : current))}>next</button>
    </div>
  );
}

describe("useToolSurface", () => {
  it("registers under StrictMode without duplicate-name errors and updates on state change", async () => {
    const context = new StrictModelContext();
    const view = render(
      <StrictMode>
        <Wizard context={context} initial={1} />
      </StrictMode>,
    );
    expect(context.duplicateErrors).toEqual([]);
    expect(context.names()).toEqual(["describe_step", "go_next"]);
    expect(view.getByTestId("registered").textContent).toBe("describe_step,go_next");

    await act(async () => {
      view.getByText("next").click();
    });
    await act(async () => {
      view.getByText("next").click();
    });
    expect(context.names().sort()).toEqual(["describe_step", "submit"]);
    expect(context.duplicateErrors).toEqual([]);
    await expect(context.execute("describe_step")).resolves.toEqual({ content: [{ type: "text", text: "step 3" }] });

    view.unmount();
    expect(context.names()).toEqual([]);
  });

  it("reports unsupported when there is no model context", () => {
    const { result } = renderHook(() => useToolSurface({ step: 1 as const }, build, {}));
    expect(result.current.supported).toBe(false);
    expect(result.current.registered).toEqual([]);
    expect(result.current.tools.map((tool) => tool.name)).toEqual(["describe_step", "go_next"]);
  });
});

describe("useCommittedDispatch", () => {
  type Action = { type: "inc" };
  const reducer = (state: { count: number }, action: Action) => (action.type === "inc" ? { count: state.count + 1 } : state);

  it("resolves dispatchAndCommit only after the new state has rendered", async () => {
    const seen: number[] = [];
    const { result } = renderHook(() => {
      const value = useCommittedDispatch(reducer, { count: 0 });
      seen.push(value[0].count);
      return value;
    });
    let settled = false;
    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = result.current[2]({ type: "inc" }).then(() => {
        settled = true;
      });
    });
    await act(async () => {
      await promise;
    });
    expect(settled).toBe(true);
    expect(result.current[0].count).toBe(1);
    expect(result.current[3]).toBe(1);
    expect(seen.at(-1)).toBe(1);
  });

  it("gives each dispatch its own revision so back-to-back commits resolve in order", async () => {
    const { result } = renderHook(() => useCommittedDispatch(reducer, { count: 0 }));
    const order: string[] = [];
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      const first = result.current[2]({ type: "inc" }).then(() => order.push("first"));
      const second = result.current[2]({ type: "inc" }).then(() => order.push("second"));
      pending = Promise.all([first, second]);
    });
    await act(async () => {
      await pending;
    });
    expect(order).toEqual(["first", "second"]);
    expect(result.current[0].count).toBe(2);
  });
});

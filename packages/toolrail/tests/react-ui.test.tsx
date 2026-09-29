import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SurfaceTool } from "../src";
import { CallTrace, ToolRail, useToolExecutor } from "../src/react";

const tools = (names: string[]): SurfaceTool[] =>
  names.map((name) => ({ name, mode: name.startsWith("play") ? "ACT" : "READ", description: name, detail: name === "play_move" ? "22 legal" : undefined, execute: () => null }));

describe("ToolRail", () => {
  it("renders badges and details, and keeps removed tools briefly as exiting", async () => {
    vi.useFakeTimers();
    const view = render(<ToolRail tools={tools(["describe_board", "play_move"])} />);
    expect(view.container.querySelectorAll("li").length).toBe(2);
    expect(view.container.querySelector('li[data-tool-name="play_move"]')?.getAttribute("data-mode")).toBe("act");
    expect(view.getByText("22 legal")).toBeTruthy();

    view.rerender(<ToolRail tools={tools(["describe_board"])} />);
    const exiting = view.container.querySelector('li[data-tool-name="play_move"]');
    expect(exiting?.getAttribute("data-exiting")).toBe("true");
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(view.container.querySelector('li[data-tool-name="play_move"]')).toBeNull();
    vi.useRealTimers();
  });
});

describe("CallTrace", () => {
  it("shows an empty state and then entries with verdicts", () => {
    const view = render(<CallTrace entries={[]} />);
    expect(view.getByText(/Agent calls will appear here/)).toBeTruthy();
    view.rerender(
      <CallTrace
        entries={[
          { id: "1", timestamp: new Date().toISOString(), name: "play_move", args: { move: "e7-e6" }, result: "ok", isError: false, durationMs: 12 },
          { id: "2", timestamp: new Date().toISOString(), name: "play_move", args: {}, result: "nope", isError: true, durationMs: 3 },
        ]}
      />,
    );
    expect(view.container.querySelectorAll("li").length).toBe(2);
    expect(view.container.querySelector('li[data-error="true"]')).not.toBeNull();
    expect(view.getAllByText("OK").length + view.getAllByText("ERROR").length).toBe(2);
  });
});

describe("useToolExecutor", () => {
  it("runs through a serial executor and exposes the trace entries", async () => {
    const { result } = renderHook(() => useToolExecutor({ execute: async (name) => ({ echoed: name }) }));
    await act(async () => {
      await result.current.run("describe_board", {});
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.name).toBe("describe_board");
    expect(result.current.entries[0]?.isError).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { assertOutputBudget, fitToBudget, measureToolOutput, normalizeToolResponse, OutputBudgetError } from "../src";

describe("output budget", () => {
  it("measures the normalized envelope the agent receives, not the raw value", () => {
    const payload = { message: 'A quoted "move"' };
    const envelope = { content: [{ type: "text", text: JSON.stringify(payload) }] };
    expect(measureToolOutput(payload)).toBe(JSON.stringify(envelope).length);
    expect(measureToolOutput(payload)).toBeGreaterThan(JSON.stringify(payload).length);
    expect(measureToolOutput("hi")).toBe(JSON.stringify({ content: [{ type: "text", text: "hi" }] }).length);
    expect(normalizeToolResponse(null)).toEqual({ content: [] });
    expect(normalizeToolResponse({ content: [{ type: "text", text: "x" }] })).toEqual({ content: [{ type: "text", text: "x" }] });
  });

  it("throws a typed error when a result exceeds the budget", () => {
    expect(() => assertOutputBudget("list_things", "x".repeat(10), 100)).not.toThrow();
    expect(() => assertOutputBudget("list_things", "x".repeat(200), 100)).toThrow(OutputBudgetError);
    try {
      assertOutputBudget("list_things", "x".repeat(200), 100);
    } catch (error) {
      const budgetError = error as OutputBudgetError;
      expect(budgetError.tool).toBe("list_things");
      expect(budgetError.max).toBe(100);
      expect(budgetError.length).toBeGreaterThan(200);
    }
  });

  it("returns everything when it fits", () => {
    const items = ["a1-a2", "b1-b2", "c1-c2"];
    const fit = fitToBudget(items, { max: 500, wrap: (included, meta) => ({ ...meta, moves: included }) });
    expect(fit.returned).toBe(3);
    expect(fit.truncated).toBe(false);
    expect(fit.output.moves).toEqual(items);
  });

  it("truncates deterministically and never exceeds the budget", () => {
    const items = Array.from({ length: 200 }, (_, index) => `move-${index.toString().padStart(3, "0")}`);
    const max = 400;
    const fit = fitToBudget(items, { max, wrap: (included, meta) => ({ ...meta, moves: included }) });
    expect(fit.truncated).toBe(true);
    expect(fit.returned).toBeGreaterThan(0);
    expect(fit.returned).toBeLessThan(200);
    expect(fit.output.moves).toEqual(items.slice(0, fit.returned));
    expect(measureToolOutput(fit.output)).toBeLessThanOrEqual(max);
    const oneMore = { ...fit, returned: fit.returned + 1, moves: items.slice(0, fit.returned + 1) };
    expect(measureToolOutput(oneMore)).toBeGreaterThan(max);
    expect(fitToBudget(items, { max, wrap: (included, meta) => ({ ...meta, moves: included }) })).toEqual(fit);
  });

  it("supports grouped output via wrap", () => {
    const items = [
      { tag: "advance", move: "a2-a3" },
      { tag: "capture", move: "b2xc3" },
      { tag: "advance", move: "d2-d3" },
    ];
    const fit = fitToBudget(items, {
      max: 5_000,
      wrap: (included, meta) => ({
        ...meta,
        moves: included.reduce<Record<string, string[]>>((groups, item) => {
          (groups[item.tag] ??= []).push(item.move);
          return groups;
        }, {}),
      }),
    });
    expect(fit.output.moves).toEqual({ advance: ["a2-a3", "d2-d3"], capture: ["b2xc3"] });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createRevisionWaiter, createSerialExecutor, OutputBudgetError, type TraceEntry } from "../src";

describe("createSerialExecutor", () => {
  it("runs calls one at a time in order and traces each before resolving", async () => {
    const order: string[] = [];
    const traces: TraceEntry[] = [];
    const executor = createSerialExecutor({
      execute: async (name) => {
        order.push(`start ${name}`);
        await new Promise((resolve) => setTimeout(resolve, name === "slow" ? 20 : 1));
        order.push(`end ${name}`);
        return { name };
      },
      onTrace: async (entry) => {
        await Promise.resolve();
        traces.push(entry);
      },
    });
    const slow = executor.run("slow");
    const fast = executor.run("fast");
    expect(executor.pending).toBe(2);
    await Promise.all([slow, fast]);
    expect(order).toEqual(["start slow", "end slow", "start fast", "end fast"]);
    expect(traces.map((entry) => `${entry.name}:${entry.isError}`)).toEqual(["slow:false", "fast:false"]);
    expect(traces[0]?.result).toBe(JSON.stringify({ name: "slow" }));
    expect(executor.pending).toBe(0);
  });

  it("traces errors, rethrows, and keeps the queue alive", async () => {
    const onTrace = vi.fn();
    const executor = createSerialExecutor({
      execute: (name) => {
        if (name === "bad") throw new Error("nope");
        return "ok";
      },
      onTrace,
    });
    await expect(executor.run("bad")).rejects.toThrow("nope");
    await expect(executor.run("good")).resolves.toBe("ok");
    expect(onTrace.mock.calls.map(([entry]) => [entry.name, entry.isError, entry.result])).toEqual([
      ["bad", true, "nope"],
      ["good", false, "ok"],
    ]);
  });

  it("enforces the output budget", async () => {
    const executor = createSerialExecutor({ execute: () => "x".repeat(2_000), budget: 100 });
    await expect(executor.run("big")).rejects.toThrow(OutputBudgetError);
    const unlimited = createSerialExecutor({ execute: () => "x".repeat(2_000), budget: false });
    await expect(unlimited.run("big")).resolves.toHaveLength(2_000);
  });
});

describe("createRevisionWaiter", () => {
  it("resolves waiters once the committed revision reaches their target", async () => {
    const waiter = createRevisionWaiter(0);
    const resolved: number[] = [];
    void waiter.waitFor(2).then(() => resolved.push(2));
    void waiter.waitFor(1).then(() => resolved.push(1));
    await expect(waiter.waitFor(0)).resolves.toBeUndefined();
    waiter.commit(1);
    await Promise.resolve();
    expect(resolved).toEqual([1]);
    waiter.commit(2);
    await Promise.resolve();
    expect(resolved).toEqual([1, 2]);
    const late = waiter.waitFor(9);
    waiter.flush();
    await expect(late).resolves.toBeUndefined();
  });
});

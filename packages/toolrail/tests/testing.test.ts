import { describe, expect, it } from "vitest";
import { getModelContext, installStrictModelContext, StrictModelContext, uninstallModelContext } from "../src";

describe("StrictModelContext", () => {
  it("throws InvalidStateError on duplicate names and drops tools on abort", () => {
    const context = new StrictModelContext();
    const controller = new AbortController();
    context.registerTool({ name: "a", description: "first", execute: () => 1 }, { signal: controller.signal });
    expect(() => context.registerTool({ name: "a", description: "again", execute: () => 2 })).toThrow(DOMException);
    expect(context.duplicateErrors[0]?.name).toBe("InvalidStateError");
    controller.abort();
    expect(context.names()).toEqual([]);
    const aborted = new AbortController();
    aborted.abort();
    context.registerTool({ name: "b", description: "never", execute: () => 3 }, { signal: aborted.signal });
    expect(context.names()).toEqual([]);
  });

  it("installs on the document and can be removed", () => {
    expect(getModelContext()).toBeUndefined();
    const installed = installStrictModelContext();
    expect(getModelContext()).toBe(installed);
    uninstallModelContext();
    expect(getModelContext()).toBeUndefined();
  });
});

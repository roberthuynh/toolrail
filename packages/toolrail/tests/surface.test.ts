import { describe, expect, it, vi } from "vitest";
import { defineSurface, mountSurface, StrictModelContext, surfaceKey, type SurfaceTool } from "../src";

interface State {
  readonly step: number;
  readonly options: readonly string[];
}

const build = defineSurface<State>((state) => {
  const tools: SurfaceTool[] = [
    { name: "describe", mode: "READ", description: "Describe the current step.", execute: () => `step ${state.step}` },
  ];
  if (state.options.length > 0) {
    tools.push({
      name: "choose",
      mode: "ACT",
      description: "Choose one option.",
      detail: `${state.options.length} options`,
      inputSchema: {
        type: "object",
        properties: { option: { type: "string", enum: state.options } },
        required: ["option"],
        additionalProperties: false,
      },
      execute: (input) => ({ chosen: (input as { option: string }).option, step: state.step }),
    });
  }
  return tools;
});

describe("mountSurface", () => {
  it("registers tools, defaults readOnlyHint from mode and normalizes responses", async () => {
    const context = new StrictModelContext();
    const mounted = mountSurface(context, build({ step: 1, options: ["a", "b"] }));
    expect(mounted.supported).toBe(true);
    expect(context.names()).toEqual(["describe", "choose"]);
    expect(context.get("describe")?.annotations).toEqual({ readOnlyHint: true });
    expect(context.get("choose")?.annotations).toEqual({ readOnlyHint: false });
    expect(context.get("describe")?.inputSchema).toEqual({ type: "object", properties: {}, required: [], additionalProperties: false });
    await expect(context.execute("describe")).resolves.toEqual({ content: [{ type: "text", text: "step 1" }] });
    mounted.dispose();
    expect(context.names()).toEqual([]);
  });

  it("removes vanished tools and re-registers changed schemas, removing before adding", () => {
    const context = new StrictModelContext();
    const mounted = mountSurface(context, build({ step: 1, options: ["a", "b"] }));
    const before = context.get("choose");
    mounted.update(build({ step: 2, options: ["c"] }));
    expect(context.duplicateErrors).toEqual([]);
    expect(context.get("choose")).not.toBe(before);
    expect(context.registrations).toEqual(["describe", "choose", "choose"]);
    mounted.update(build({ step: 3, options: [] }));
    expect(context.names()).toEqual(["describe"]);
    expect(mounted.registered).toEqual(["describe"]);
  });

  it("keeps an unchanged registration but executes the latest closure", async () => {
    const context = new StrictModelContext();
    const mounted = mountSurface(context, build({ step: 1, options: [] }));
    const registration = context.get("describe");
    mounted.update(build({ step: 5, options: [] }));
    expect(context.get("describe")).toBe(registration);
    await expect(context.execute("describe")).resolves.toEqual({ content: [{ type: "text", text: "step 5" }] });
  });

  it("emits toolchange on every registration change and reports registered names", () => {
    const context = new StrictModelContext();
    const changes = vi.fn();
    context.addEventListener("toolchange", changes);
    const onChange = vi.fn();
    const mounted = mountSurface(context, build({ step: 1, options: ["a"] }), { onChange });
    expect(onChange).toHaveBeenLastCalledWith(["describe", "choose"]);
    mounted.update(build({ step: 1, options: [] }));
    expect(onChange).toHaveBeenLastCalledWith(["describe"]);
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it("is a no-op without a ModelContext", () => {
    const mounted = mountSurface(undefined, build({ step: 1, options: ["a"] }));
    expect(mounted.supported).toBe(false);
    expect(mounted.registered).toEqual([]);
    expect(() => mounted.update(build({ step: 2, options: [] }))).not.toThrow();
    mounted.dispose();
  });

  it("rejects duplicate names within one surface", () => {
    const context = new StrictModelContext();
    const tools: SurfaceTool[] = [
      { name: "x", mode: "READ", description: "one", execute: () => 1 },
      { name: "x", mode: "READ", description: "two", execute: () => 2 },
    ];
    expect(() => mountSurface(context, tools)).toThrow(/duplicate tool name "x"/);
  });

  it("reports registration errors instead of throwing", () => {
    const context = new StrictModelContext();
    context.registerTool({ name: "describe", description: "taken", execute: () => null });
    const onError = vi.fn();
    mountSurface(context, build({ step: 1, options: [] }), { onError });
    expect(onError).toHaveBeenCalledWith("describe", expect.any(DOMException));
  });

  it("changes the key when anything the agent can see changes", () => {
    const base: SurfaceTool = { name: "t", mode: "READ", description: "d", execute: () => null };
    expect(surfaceKey(base)).toBe(surfaceKey({ ...base, execute: () => 1, detail: "ignored" }));
    expect(surfaceKey(base)).not.toBe(surfaceKey({ ...base, description: "changed" }));
    expect(surfaceKey(base)).not.toBe(surfaceKey({ ...base, mode: "ACT" }));
  });
});

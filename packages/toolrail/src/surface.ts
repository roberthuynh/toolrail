import { normalizeToolResponse } from "./response";
import { EMPTY_INPUT_SCHEMA, type ModelContext, type ModelContextTool, type SurfaceTool, type ToolAnnotations } from "./types";

export type SurfaceBuilder<S> = (state: S) => readonly SurfaceTool[];

export function assertUniqueNames(tools: readonly SurfaceTool[]): void {
  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.name)) throw new Error(`toolrail: duplicate tool name "${tool.name}" in one surface.`);
    seen.add(tool.name);
  }
}

/** Wraps a builder so every surface it produces has unique names. Purely a typing and validation aid. */
export function defineSurface<S>(build: SurfaceBuilder<S>): SurfaceBuilder<S> {
  return (state) => {
    const tools = build(state);
    assertUniqueNames(tools);
    return tools;
  };
}

export function resolveAnnotations(tool: SurfaceTool): ToolAnnotations {
  return { readOnlyHint: tool.mode === "READ", ...tool.annotations };
}

/** Identity of a registration: anything the agent can see. A change here forces remove-then-add. */
export function surfaceKey(tool: SurfaceTool): string {
  return JSON.stringify({
    name: tool.name,
    title: tool.title ?? null,
    description: tool.description,
    inputSchema: tool.inputSchema ?? EMPTY_INPUT_SCHEMA,
    annotations: resolveAnnotations(tool),
  });
}

export interface MountSurfaceOptions {
  readonly onChange?: (registered: readonly string[]) => void;
  readonly onError?: (name: string, error: unknown) => void;
  /** Override how raw return values become the agent-facing response. */
  readonly toResponse?: (value: unknown) => unknown;
}

export interface MountedSurface {
  /** Diff against the current registrations: abort removed or changed tools first, then register. */
  update(tools: readonly SurfaceTool[]): void;
  dispose(): void;
  readonly registered: readonly string[];
  readonly supported: boolean;
}

interface Entry {
  readonly key: string;
  readonly controller: AbortController;
  current: SurfaceTool;
}

/**
 * Registers a list of tools on a ModelContext and keeps it in sync with later `update` calls.
 * The spec has no unregister; removal is the AbortSignal. Removals run before additions so a
 * renamed-in-place schema never trips the duplicate-name error.
 */
export function mountSurface(
  modelContext: ModelContext | undefined,
  tools: readonly SurfaceTool[],
  options: MountSurfaceOptions = {},
): MountedSurface {
  const entries = new Map<string, Entry>();
  const toResponse = options.toResponse ?? normalizeToolResponse;
  let order: readonly string[] = [];
  let disposed = false;

  const registered = (): readonly string[] => order.filter((name) => entries.has(name));

  function register(tool: SurfaceTool): void {
    if (!modelContext) return;
    const controller = new AbortController();
    const entry: Entry = { key: surfaceKey(tool), controller, current: tool };
    const definition: ModelContextTool = {
      name: tool.name,
      ...(tool.title !== undefined ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema: tool.inputSchema ?? EMPTY_INPUT_SCHEMA,
      annotations: resolveAnnotations(tool),
      execute: async (input, context) => {
        const result = await entry.current.execute(input, { signal: context?.signal });
        return toResponse(result);
      },
    };
    try {
      const maybe = modelContext.registerTool(definition, { signal: controller.signal });
      if (maybe && typeof (maybe as Promise<void>).then === "function") {
        (maybe as Promise<void>).catch((error: unknown) => options.onError?.(tool.name, error));
      }
      entries.set(tool.name, entry);
    } catch (error) {
      options.onError?.(tool.name, error);
    }
  }

  function update(next: readonly SurfaceTool[]): void {
    if (disposed) return;
    assertUniqueNames(next);
    order = next.map((tool) => tool.name);
    if (!modelContext) return;
    const nextByName = new Map(next.map((tool) => [tool.name, tool] as const));

    for (const [name, entry] of entries) {
      const tool = nextByName.get(name);
      if (!tool || surfaceKey(tool) !== entry.key) {
        entry.controller.abort();
        entries.delete(name);
      }
    }
    for (const tool of next) {
      const entry = entries.get(tool.name);
      if (entry) entry.current = tool;
      else register(tool);
    }
    options.onChange?.(registered());
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const entry of entries.values()) entry.controller.abort();
    entries.clear();
    options.onChange?.([]);
  }

  update(tools);

  return {
    update,
    dispose,
    get registered() {
      return registered();
    },
    get supported() {
      return modelContext !== undefined;
    },
  };
}

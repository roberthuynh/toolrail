import type { ExecuteContext, ModelContext, ModelContextTool, RegisterToolOptions } from "./types";

/**
 * A strict stand-in for `document.modelContext` for unit tests: throws `InvalidStateError` on a
 * duplicate name (as Chrome does), drops a tool when its signal aborts, records executions, and
 * dispatches `toolchange` like the spec. Ported from Boardspeak's test suite.
 */
export class StrictModelContext extends EventTarget implements ModelContext {
  readonly active = new Map<string, ModelContextTool>();
  readonly duplicateErrors: DOMException[] = [];
  readonly calls: { readonly name: string; readonly input: unknown }[] = [];
  readonly registrations: string[] = [];

  registerTool(tool: ModelContextTool, options?: RegisterToolOptions): void {
    if (options?.signal?.aborted) return;
    if (this.active.has(tool.name)) {
      const error = new DOMException(`A tool named ${tool.name} is already registered.`, "InvalidStateError");
      this.duplicateErrors.push(error);
      throw error;
    }
    this.active.set(tool.name, tool);
    this.registrations.push(tool.name);
    options?.signal?.addEventListener(
      "abort",
      () => {
        if (this.active.get(tool.name) === tool) {
          this.active.delete(tool.name);
          this.dispatchEvent(new Event("toolchange"));
        }
      },
      { once: true },
    );
    this.dispatchEvent(new Event("toolchange"));
  }

  names(): string[] {
    return [...this.active.keys()];
  }

  get(name: string): ModelContextTool | undefined {
    return this.active.get(name);
  }

  async execute(name: string, input: unknown = {}, context: ExecuteContext = {}): Promise<unknown> {
    const tool = this.active.get(name);
    if (!tool) throw new Error(`No tool named ${name} is registered.`);
    this.calls.push({ name, input });
    return tool.execute(input, context);
  }
}

/** Installs a StrictModelContext as `document.modelContext` (configurable, so tests can remove it). */
export function installStrictModelContext(doc: Document = document): StrictModelContext {
  const context = new StrictModelContext();
  Object.defineProperty(doc, "modelContext", { value: context, configurable: true, writable: true });
  return context;
}

export function uninstallModelContext(doc: Document = document): void {
  delete (doc as Document & { modelContext?: unknown }).modelContext;
}

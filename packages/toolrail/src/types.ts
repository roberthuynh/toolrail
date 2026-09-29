/** Annotations from the WebMCP spec (all default to false). */
export interface ToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly consequentialHint?: boolean;
  readonly untrustedContentHint?: boolean;
  readonly debugging?: boolean;
}

/** A JSON Schema object node. Keep it strict: `additionalProperties: false` and an explicit `required`. */
export interface JsonObjectSchema {
  readonly type: "object";
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly [key: string]: unknown;
}

export interface ExecuteContext {
  readonly signal?: AbortSignal;
}

/** The tool shape `document.modelContext.registerTool` accepts. */
export interface ModelContextTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: JsonObjectSchema;
  readonly annotations?: ToolAnnotations;
  readonly execute: (input: unknown, context?: ExecuteContext) => unknown | Promise<unknown>;
}

export interface RegisterToolOptions {
  readonly signal?: AbortSignal;
  readonly exposedTo?: unknown;
}

/** The subset of `document.modelContext` toolrail relies on. Unregistering is done by aborting the signal. */
export interface ModelContext extends EventTarget {
  registerTool(tool: ModelContextTool, options?: RegisterToolOptions): void | Promise<void>;
}

export type ToolMode = "READ" | "ACT";

/**
 * A tool as your app describes it. `mode` drives the default `readOnlyHint` and the rail badge;
 * `detail` is a short live label such as "22 options" shown next to the name.
 */
export interface SurfaceTool<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly mode: ToolMode;
  readonly description: string;
  readonly title?: string;
  readonly inputSchema?: JsonObjectSchema;
  readonly annotations?: ToolAnnotations;
  readonly detail?: string;
  readonly execute: (input: Input, context: ExecuteContext) => Output | Promise<Output>;
}

export interface ToolContentResponse {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
}

export const EMPTY_INPUT_SCHEMA: JsonObjectSchema = Object.freeze({
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
});

/** Reads `document.modelContext` without augmenting global types. */
export function getModelContext(doc?: Document | null): ModelContext | undefined {
  const target = doc ?? (typeof document === "undefined" ? undefined : document);
  if (!target) return undefined;
  return (target as Document & { modelContext?: ModelContext }).modelContext;
}

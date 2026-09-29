import type { ToolContentResponse } from "./types";

function isContentResponse(value: unknown): value is ToolContentResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "content" in value &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

/**
 * Normalizes whatever a tool returned into the `{ content: [{ type: "text", text }] }` envelope.
 * Browsers hand agents a string, so this is the shape whose size matters.
 */
export function normalizeToolResponse(value: unknown): ToolContentResponse {
  if (isContentResponse(value)) return value;
  if (value === undefined || value === null) return { content: [] };
  if (typeof value === "string") return { content: [{ type: "text", text: value }] };
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

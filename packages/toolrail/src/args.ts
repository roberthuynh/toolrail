export function assertObjectArgs(value: unknown, tool: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${tool} expects a JSON object of arguments.`);
  }
  return value as Record<string, unknown>;
}

export interface EnumArgOptions {
  readonly tool: string;
  readonly key: string;
  readonly allowed: readonly string[];
  /** Appended to every error so the agent knows how to recover, e.g. "call list_options and retry". */
  readonly retryHint?: string;
}

/**
 * Reads one string argument that must be a member of `allowed`, rejecting unknown keys.
 * Errors are written to teach recovery, not just to refuse.
 */
export function enumArg(value: unknown, options: EnumArgOptions): string {
  const { tool, key, allowed } = options;
  const retry = options.retryHint ?? `retry with only ${key} set to one of the listed values`;
  const args = assertObjectArgs(value, tool);
  const extraKeys = Object.keys(args).filter((candidate) => candidate !== key);
  if (extraKeys.length > 0) {
    throw new Error(`${tool} received an unknown parameter (${extraKeys.join(", ")}); ${retry}.`);
  }
  const raw = typeof args[key] === "string" ? (args[key] as string) : "";
  if (!allowed.includes(raw)) {
    throw new Error(`${raw ? `"${raw}"` : `${key}`} is not allowed right now; ${retry}.`);
  }
  return raw;
}

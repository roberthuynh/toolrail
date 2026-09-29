import { normalizeToolResponse } from "./response";

/** Boardspeak shipped with 1,500 characters; agents read results as strings, so keep them short. */
export const DEFAULT_OUTPUT_BUDGET = 1_500;

export class OutputBudgetError extends Error {
  override readonly name = "OutputBudgetError";
  constructor(
    readonly tool: string,
    readonly length: number,
    readonly max: number,
  ) {
    super(`${tool} could not return a compact result (${length} > ${max} characters); retry after the page changes.`);
  }
}

/** Length of the normalized envelope the agent receives, not of the raw value. */
export function measureToolOutput(value: unknown): number {
  return JSON.stringify(normalizeToolResponse(value)).length;
}

export function assertOutputBudget(tool: string, value: unknown, max: number = DEFAULT_OUTPUT_BUDGET): void {
  const length = measureToolOutput(value);
  if (length > max) throw new OutputBudgetError(tool, length, max);
}

export interface FitMeta {
  readonly total: number;
  readonly returned: number;
  readonly truncated: boolean;
}

export interface FitToBudgetOptions<T, O> {
  readonly max?: number;
  /** Builds the complete output for a candidate slice; it is measured as a whole, meta fields included. */
  readonly wrap: (included: readonly T[], meta: FitMeta) => O;
}

export interface FitResult<O> extends FitMeta {
  readonly output: O;
}

/**
 * Adds items one at a time and re-measures the whole wrapped output after each, so the returned
 * output is deterministic and never exceeds `max`. Ported from Boardspeak's `compactLegalMoves`.
 */
export function fitToBudget<T, O>(items: readonly T[], options: FitToBudgetOptions<T, O>): FitResult<O> {
  const max = options.max ?? DEFAULT_OUTPUT_BUDGET;
  const total = items.length;
  const included: T[] = [];
  const meta = (): FitMeta => ({ total, returned: included.length, truncated: included.length < total });

  for (const item of items) {
    included.push(item);
    if (measureToolOutput(options.wrap(included, meta())) > max) {
      included.pop();
      break;
    }
  }

  const finalMeta = meta();
  return { ...finalMeta, output: options.wrap(included, finalMeta) };
}

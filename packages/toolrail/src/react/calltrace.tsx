import type { ReactNode } from "react";
import type { TraceEntry } from "../trace";

export interface CallTraceProps {
  readonly entries: readonly TraceEntry[];
  readonly title?: ReactNode;
  readonly emptyText?: ReactNode;
  readonly className?: string;
  /** Characters shown per argument/result block before truncation. */
  readonly limit?: number;
  readonly defaultOpen?: boolean;
}

function serialize(value: unknown, limit: number): string {
  let output: string;
  if (typeof value === "string") output = value;
  else {
    try {
      output = JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      output = "[Result could not be displayed]";
    }
  }
  return output.length > limit ? `${output.slice(0, limit - 1)}…` : output;
}

function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? timestamp
    : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(parsed);
}

/** Every agent call on the page, newest first, without opening DevTools. Ported from Boardspeak. */
export function CallTrace({
  entries,
  title = "Agent call trace",
  emptyText = "Agent calls will appear here, without opening DevTools.",
  className = "toolrail-trace",
  limit = 600,
  defaultOpen,
}: CallTraceProps) {
  return (
    <details className={className} data-toolrail="trace" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <span className={`${className}-count`}>{entries.length}</span>
      </summary>
      {entries.length > 0 ? (
        <ol className={`${className}-list`}>
          {entries.map((entry) => (
            <li className={`${className}-entry`} data-error={entry.isError ? "true" : undefined} key={entry.id}>
              <div className={`${className}-heading`}>
                <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                <code>{entry.name}</code>
                <span className={`${className}-verdict`}>{entry.isError ? "ERROR" : "OK"}</span>
                <span className={`${className}-duration`}>{Math.round(entry.durationMs)} ms</span>
              </div>
              <dl>
                <div>
                  <dt>Arguments</dt>
                  <dd>
                    <pre tabIndex={0}>{serialize(entry.args, limit)}</pre>
                  </dd>
                </div>
                <div>
                  <dt>{entry.isError ? "Error" : "Result"}</dt>
                  <dd>
                    <pre tabIndex={0}>{serialize(entry.result, limit)}</pre>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <p className={`${className}-empty`}>{emptyText}</p>
      )}
    </details>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SurfaceTool, ToolMode } from "../types";

export interface ToolRailEntry {
  readonly name: string;
  readonly mode: ToolMode;
  readonly detail?: string;
}

export interface ToolRailProps {
  /** The current surface (a `SurfaceTool[]` works directly). */
  readonly tools: readonly ToolRailEntry[] | readonly SurfaceTool[];
  readonly title?: ReactNode;
  readonly kicker?: ReactNode;
  readonly emptyText?: ReactNode;
  readonly className?: string;
  /** Milliseconds a removed tool stays rendered with `data-exiting` so it can animate out. */
  readonly exitMs?: number;
}

/**
 * The live list of tools the agent can see right now, with READ/ACT badges and a short detail label.
 * Removed tools linger briefly with `data-exiting="true"` for an exit animation. Ported from Boardspeak.
 */
export function ToolRail({
  tools,
  title = "Tools your agent can see right now",
  kicker = "Live WebMCP surface",
  emptyText = "The page is preparing its tools.",
  className = "toolrail-rail",
  exitMs = 210,
}: ToolRailProps) {
  const entries = tools as readonly ToolRailEntry[];
  const previousRef = useRef(entries);
  const timersRef = useRef<number[]>([]);
  const [departing, setDeparting] = useState<readonly ToolRailEntry[]>([]);
  const activeNames = new Set(entries.map((entry) => entry.name));
  const newlyDeparting = previousRef.current.filter((entry) => !activeNames.has(entry.name));
  const departingByName = new Map(
    [...departing, ...newlyDeparting].filter((entry) => !activeNames.has(entry.name)).map((entry) => [entry.name, entry] as const),
  );
  const rendered = [
    ...entries.map((entry) => ({ ...entry, exiting: false })),
    ...[...departingByName.values()].map((entry) => ({ ...entry, exiting: true })),
  ];

  useEffect(() => {
    const nextNames = new Set(entries.map((entry) => entry.name));
    const removed = previousRef.current.filter((entry) => !nextNames.has(entry.name));
    previousRef.current = entries;
    if (removed.length === 0) return;
    const removedNames = new Set(removed.map((entry) => entry.name));
    setDeparting((current) => [...current.filter((entry) => !removedNames.has(entry.name)), ...removed]);
    const timer = window.setTimeout(() => {
      setDeparting((current) => current.filter((entry) => !removedNames.has(entry.name)));
    }, exitMs);
    timersRef.current.push(timer);
  }, [entries, exitMs]);

  useEffect(
    () => () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
    },
    [],
  );

  return (
    <section className={className} data-toolrail="rail" aria-label={typeof title === "string" ? title : undefined}>
      <div className={`${className}-heading`}>
        {kicker ? <p className={`${className}-kicker`}>{kicker}</p> : null}
        <h2>{title}</h2>
      </div>
      {rendered.length > 0 ? (
        <ul className={`${className}-list`}>
          {rendered.map((entry) => (
            <li
              aria-hidden={entry.exiting || undefined}
              className={`${className}-entry`}
              data-exiting={entry.exiting ? "true" : undefined}
              data-mode={entry.mode.toLowerCase()}
              data-tool-name={entry.name}
              key={entry.name}
            >
              <span className={`${className}-badge`}>{entry.mode}</span>
              <code>{entry.name}</code>
              {entry.detail ? <span className={`${className}-detail`}>{entry.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${className}-empty`}>{emptyText}</p>
      )}
    </section>
  );
}

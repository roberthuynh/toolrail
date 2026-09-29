import type { Metadata } from "next";

export const metadata: Metadata = { title: "Checker · toolrail" };

export default function CheckPage() {
  return (
    <article className="prose">
      <p className="kicker">Checker</p>
      <h1>Does your site work in ChatGPT&apos;s browser?</h1>
      <p>
        Paste a URL. The checker loads it in a WebMCP-enabled Chrome, lists the tools an agent would see, and runs a set of checks against
        what ChatGPT&apos;s site tools support: imperative registration only, no tools inside iframes, strict schemas, sane descriptions,
        read-only hints, output sizes, and how the surface behaves over time.
      </p>
      <p className="status">The runner is being wired up this week. The checks themselves are documented and unit-tested first.</p>
    </article>
  );
}

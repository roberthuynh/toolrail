import Link from "next/link";

export default function Home() {
  return (
    <article className="prose">
      <p className="kicker">WebMCP for pages whose tools change with state</p>
      <h1>The page tells the agent what it can do right now.</h1>
      <p>
        WebMCP lets a web page register typed tools on <code>document.modelContext</code> so browser agents such as ChatGPT&apos;s desktop
        browser, Codex and Chrome can operate it. toolrail is the layer above registration: a tool surface that follows your app state,
        output budgets, commit-before-resolve execution, confirm-gated writes, and an on-page rail and call trace people can see.
      </p>
      <p>
        <Link className="button" href="/demo">
          Try the demo wizard
        </Link>{" "}
        <Link className="button secondary" href="/check">
          Check a URL
        </Link>
      </p>
      <h2>Install</h2>
      <pre>
        <code>pnpm add toolrail</code>
      </pre>
      <h2>What it covers</h2>
      <ul>
        <li>
          <strong>Surface that follows state.</strong> Describe the tools that exist right now as a function of state; toolrail aborts removed or
          changed tools before registering new ones, and keeps execute closures current.
        </li>
        <li>
          <strong>Output budgets.</strong> Agents read results as strings. Keep them inside a deterministic character budget with a{" "}
          <code>truncated</code> flag.
        </li>
        <li>
          <strong>Commit-before-resolve.</strong> A call resolves only after the UI shows its effect.
        </li>
        <li>
          <strong>Confirm-gated writes.</strong> A native dialog tied to the call&apos;s <code>AbortSignal</code>.
        </li>
        <li>
          <strong>Rail and trace.</strong> What the agent can do, and what it did, on the page.
        </li>
      </ul>
      <p>
        It does not lint (<a href="https://www.npmjs.com/package/webmcp-lint">webmcp-lint</a>) or run evals (
        <a href="https://github.com/GoogleChromeLabs/webmcp-tools">webmcp-evals</a>).
      </p>
    </article>
  );
}

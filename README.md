# toolrail

Monorepo for [`toolrail`](packages/toolrail) (npm) and the site at [webmcp.huynhrobert.com](https://webmcp.huynhrobert.com) (`apps/web`): docs, a demo wizard whose WebMCP tool surface changes per step, and a hosted checker that loads a URL in a WebMCP-enabled Chrome and reports what an agent sees.

## Stack

pnpm workspaces, TypeScript, tsup, Vitest, Next.js (App Router) on Vercel, Cloudflare Browser Run for the checker's headless Chrome, changesets for releases.

## Run

```sh
pnpm install
pnpm test
pnpm build
pnpm --filter web dev
```

## Release

Add a changeset (`pnpm changeset`), merge to `main`; the Release workflow versions and publishes with npm provenance.

## License

MIT

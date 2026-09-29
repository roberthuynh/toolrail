// Spike: can Cloudflare Browser Run (Lab) enumerate a page's WebMCP tools?
// Usage: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_BROWSER_RUN_TOKEN=... node spike/browser-run.mjs https://boardspeak.vercel.app
import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync } from "node:fs";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_BROWSER_RUN_TOKEN;
const url = process.argv[2] ?? "https://boardspeak.vercel.app";
if (!account || !token) {
  console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_BROWSER_RUN_TOKEN (Browser Rendering: Edit).");
  process.exit(2);
}

const endpoint = `wss://api.cloudflare.com/client/v4/accounts/${account}/browser-run/devtools/browser?keep_alive=120000&lab=true`;
const result = { url, startedAt: new Date().toISOString(), steps: [] };
const step = (name, data) => {
  result.steps.push({ name, at: Date.now(), ...data });
  console.log(`[${name}]`, JSON.stringify(data));
};

let browser;
try {
  browser = await puppeteer.connect({
    browserWSEndpoint: endpoint,
    wsOptions: { headers: { Authorization: `Bearer ${token}` } },
  });
  step("connected", { version: await browser.version() });

  const page = await browser.newPage();
  const client = await page.createCDPSession();
  const cdpTools = [];
  client.on("WebMCP.toolsAdded", (event) => cdpTools.push(...event.tools));
  client.on("WebMCP.toolsRemoved", (event) => step("cdp.toolsRemoved", { names: event.tools.map((t) => t.name) }));
  try {
    await client.send("WebMCP.enable");
    step("cdp.enable", { ok: true });
  } catch (error) {
    step("cdp.enable", { ok: false, error: String(error?.message ?? error) });
  }

  await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
  await new Promise((resolve) => setTimeout(resolve, 3_000));

  const probe = await page.evaluate(async () => {
    const out = {
      documentModelContext: typeof document.modelContext,
      navigatorModelContext: typeof navigator.modelContext,
      modelContextTesting: typeof navigator.modelContextTesting,
      testingTools: null,
      ua: navigator.userAgent,
    };
    try {
      const testing = navigator.modelContextTesting;
      if (testing && typeof testing.listTools === "function") {
        const tools = await testing.listTools();
        out.testingTools = (tools ?? []).map((t) => ({ name: t.name, description: t.description?.slice(0, 80) }));
      }
    } catch (error) {
      out.testingError = String(error?.message ?? error);
    }
    return out;
  });
  step("page.probe", probe);

  let puppeteerTools = null;
  try {
    const tools = page.webmcp ? await page.webmcp.tools() : null;
    puppeteerTools = tools ? tools.map((t) => ({ name: t.name, description: String(t.description ?? "").slice(0, 80) })) : "page.webmcp missing";
  } catch (error) {
    puppeteerTools = `error: ${String(error?.message ?? error)}`;
  }
  step("puppeteer.webmcp.tools", { tools: puppeteerTools });
  step("cdp.toolsAdded", { count: cdpTools.length, names: cdpTools.map((t) => t.name), frames: [...new Set(cdpTools.map((t) => t.frameId))].length });

  result.verdict = {
    cdpDomain: cdpTools.length > 0 ? "works" : "no tools via CDP",
    testingApi: Array.isArray(probe.testingTools) ? `works (${probe.testingTools.length} tools)` : "unavailable",
    nativeDocumentModelContext: probe.documentModelContext !== "undefined",
  };
  console.log("VERDICT", JSON.stringify(result.verdict));
} catch (error) {
  result.error = String(error?.stack ?? error);
  console.error("FAILED", result.error);
} finally {
  try {
    await browser?.disconnect();
  } catch {}
  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  const file = new URL(`./results/${result.startedAt.replace(/[:.]/g, "-")}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.log("saved", file.pathname);
}

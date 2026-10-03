import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";

const socket = createServer();
await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const server = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore","pipe","pipe"] });
let output = "";
server.stdout.on("data", chunk => { output += chunk; });
server.stderr.on("data", chunk => { output += chunk; });
const origin = `http://127.0.0.1:${port}`;
try {
  let home;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { home = await fetch(origin); if (home.ok) break; } catch {}
    if (server.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(home?.ok, "Next.js did not become ready.");
  const html = await home.text();
  assert.match(html, /The BLK Shelf/);
  assert.doesNotMatch(html, /codex-preview|signin-with-chatgpt/);
  const versionResponse = await fetch(`${origin}/api/app-version`);
  assert.equal(versionResponse.status, 200);
  assert.match(versionResponse.headers.get("cache-control"), /no-store/);
  const { version } = await versionResponse.json();
  assert.match(version, /^[0-9a-f-]{36}$/i);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  const js = (await Promise.all(scripts.map(async source => (await fetch(`${origin}${source}`)).text()))).join("\n");
  assert.ok(js.includes(version), "Client and update endpoint must have the same build release.");
  const pages = (await readdir("public/mirror")).filter(name => name.endsWith(".html"));
  for (const page of pages) {
    const response = await fetch(`${origin}/mirror/${page}`);
    assert.equal(response.status, 200, page);
    assert.match(response.headers.get("cache-control"), /no-cache/);
  }
  for (const api of ["shelf","reader-profile","author-favorites"]) {
    const response = await fetch(`${origin}/api/${api}`);
    assert.equal(response.status, 401, `${api} must require reader authentication.`);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  for (const size of [180,192,512]) assert.equal((await fetch(`${origin}/blk-shelf-home-icon-${size}.png`)).status,200);
  const css = await readFile("public/mirror/includes/shared.css", "utf8");
  assert.match(css, /\.app-randomizer-actions\.app-favorite-host\s*\{[^}]*justify-content:\s*center/);
  console.log(`Production checks passed: ${pages.length} mirror pages, icons, authentication gates, and automatic updates.`);
} finally {
  server.kill("SIGTERM");
  await new Promise(resolve => {
    if (server.exitCode !== null) return resolve();
    const timeout = setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 2000);
    server.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
}

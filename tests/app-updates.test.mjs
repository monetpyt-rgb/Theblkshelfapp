import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function setup() {
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const navigator = { onLine: true };
  const navigations = [];
  const window = Object.assign(new EventTarget(), {
    location: { href: "https://example.com/?bookId=book-a#details", replace: (url) => navigations.push(url) },
  });
  const state = { version: "release-a", ready: true, refreshes: 0, requests: [], offline: false };
  const timers = new Map();
  let id = 0;
  const exports = {};
  const source = readFileSync(new URL("../lib/app-updates.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: () => ({ APP_RELEASE: "release-a" }), document, window, navigator, URL, Date, AbortController,
    setTimeout(fn, delay) { const handle = ++id; timers.set(handle, { fn, delay }); return handle; },
    clearTimeout(handle) { timers.delete(handle); },
    async fetch(url, options) {
      state.requests.push({ url, options });
      if (state.offline) throw new TypeError("Network unavailable");
      return Response.json({ version: state.version });
    },
  });
  const stop = exports.watchAppUpdates({ canRefresh: () => state.ready, refreshContent: () => state.refreshes++ });
  return { document, navigator, window, state, timers, navigations, stop };
}

async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function reopen(app) {
  app.document.visibilityState = "hidden";
  app.document.dispatchEvent(new Event("visibilitychange"));
  app.document.visibilityState = "visible";
  app.document.dispatchEvent(new Event("visibilitychange"));
}

test("reopening refreshes data on the same release and loads a new published release without reinstalling", async () => {
  const app = setup();
  await settle();
  assert.equal(app.state.requests.length, 1);
  assert.equal(app.state.refreshes, 0);
  reopen(app); await settle();
  assert.equal(app.state.refreshes, 1);
  assert.equal(app.navigations.length, 0);
  app.state.version = "release-b";
  reopen(app); await settle();
  assert.equal(app.navigations.length, 1);
  const destination = new URL(app.navigations[0]);
  assert.equal(destination.searchParams.get("_app_release"), "release-b");
  assert.equal(destination.searchParams.get("bookId"), "book-a");
  assert.equal(destination.hash, "#details");
  assert.ok(app.state.requests.every(({ options }) => options.cache === "no-store"));
  app.stop();
  assert.equal(app.timers.size, 0);
});

test("account forms and reviews defer automatic updates until it is safe", async () => {
  const app = setup(); await settle();
  app.state.ready = false;
  app.state.version = "release-b";
  reopen(app); await settle();
  assert.equal(app.state.requests.length, 1);
  assert.equal(app.navigations.length, 0);
  app.state.ready = true;
  const retry = [...app.timers.entries()].find(([, timer]) => timer.delay === 1500);
  app.timers.delete(retry[0]); retry[1].fn(); await settle();
  assert.equal(app.navigations.length, 1);
  app.stop();
});

test("offline or failed checks keep the app open and reconnecting retries; cleanup stops future checks", async () => {
  const app = setup(); await settle();
  app.navigator.onLine = false;
  reopen(app); await settle();
  assert.equal(app.state.requests.length, 1);
  app.navigator.onLine = true;
  app.state.offline = true;
  app.window.dispatchEvent(new Event("online")); await settle();
  assert.equal(app.navigations.length, 0);
  app.state.offline = false;
  app.window.dispatchEvent(new Event("online")); await settle();
  assert.equal(app.state.refreshes, 1);
  app.stop();
  const count = app.state.requests.length;
  reopen(app); app.window.dispatchEvent(new Event("online")); await settle();
  assert.equal(app.state.requests.length, count);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

function moduleUrl(source) {
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
}

test("an individual author's heart is added once, syncs saved state, and sends a safe app action", () => {
  const controls = [];
  const listeners = [];
  let observer;
  const title = { dataset: {}, textContent: "Loading...", nextElementSibling: null, insertAdjacentElement(_, button) { this.nextElementSibling = button; controls.push(button); } };
  const parent = { postMessage(message) { messages.push(message); } };
  const messages = [];
  const document = {
    documentElement: {}, getElementById() { return title; },
    querySelectorAll(selector) { return selector === ".app-author-favorite" ? controls : []; },
    createElement() { const button = { dataset: {}, events: {}, attributes: {}, className: "", textContent: "", setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, fn) { this.events[key] = fn; } }; button.classList = { contains(name) { return button.className.split(" ").includes(name); }, toggle(name, saved) { button.className = button.className.split(" ").filter((item) => item !== name).concat(saved ? [name] : []).join(" "); } }; return button; },
  };
  const source = readFileSync(new URL("../public/mirror/includes/shared.js", import.meta.url), "utf8");
  const start = source.indexOf("(function connectAuthorFavoritesToTheApp()");
  const end = source.indexOf("\n})();", start) + 6;
  vm.runInNewContext(source.slice(start, end), { document, window: { parent, location: { pathname: "/mirror/author.html", search: "?id=author-a", origin: "https://example.com" }, addEventListener(_, fn) { listeners.push(fn); } }, URL, URLSearchParams, MutationObserver: class { constructor(fn) { observer = fn; } observe() {} } });
  title.textContent = "Kaiyah Vaughn"; observer(); observer();
  assert.equal(controls.length, 1);
  assert.equal(controls[0].attributes["aria-label"], "Favorite Kaiyah Vaughn");
  listeners[0]({ origin: "https://example.com", source: parent, data: { type: "blk-shelf-favorites-state", authorFavorites: ["author-a"] } });
  assert.equal(controls[0].attributes["aria-pressed"], "true");
  listeners[0]({ origin: "https://other.example", source: parent, data: { type: "blk-shelf-favorites-state", authorFavorites: [] } });
  assert.equal(controls[0].attributes["aria-pressed"], "true");
  controls[0].events.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(messages.at(-1).type, "blk-shelf-toggle-author");
  assert.equal(messages.at(-1).authorId, "author-a");
});

test("upcoming author notices use release dates, exclude saved/dismissed books and stay matched to author IDs", async () => {
  const { upcomingAuthorBooks } = await import(moduleUrl(readFileSync(new URL("../lib/author-releases.ts", import.meta.url), "utf8")));
  const books = [
    { id: "next", authorId: "author-a", releaseDate: "2026-10-10" },
    { id: "today", authorId: "author-a", releaseDate: "2026-10-03" },
    { id: "old", authorId: "author-a", releaseDate: "2026-09-01" },
    { id: "hidden", authorId: "author-a", releaseDate: "2026-10-20" },
    { id: "saved", authorId: "author-a", releaseDate: "2026-10-21" },
    { id: "other", authorId: "author-b", releaseDate: "2026-10-05" },
    { id: "tba", authorId: "author-a", releaseDate: "TBA" },
  ];
  const notices = upcomingAuthorBooks(books, ["author-a"], { saved: "Want to Read" }, ["hidden"], new Date(2026, 9, 3, 16));
  assert.deepEqual(notices.map((book) => book.id), ["today", "next"]);
  assert.equal(upcomingAuthorBooks(books, [], {}, [], new Date(2026, 9, 3)).length, 0);
  assert.equal(books.length, 7);
});

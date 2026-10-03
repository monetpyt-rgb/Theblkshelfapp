import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

// Minimal DOM exercises the mirror-to-app bridge without network access.
class Element {
  children = [];
  dataset = {};
  attributes = {};
  events = {};
  className = "";
  textContent = "";
  classList = {
    contains: (name) => this.className.split(" ").includes(name),
    add: (name) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
    remove: (name) => { this.className = this.className.split(" ").filter((item) => item !== name).join(" "); },
    toggle: (name, active) => {
      this.className = this.className.split(" ").filter((item) => item !== name).join(" ");
      if (active) this.classList.add(name);
    },
  };
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  appendChild(child) { child.parentElement = this; this.children.push(child); }
  prepend(child) { this.children.unshift(child); }
  replaceChildren() { this.children = []; }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(selector.startsWith(".") && child.classList.contains(selector.slice(1)) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

test("the Randomizer heart stays beside View This Book and favorites the current winner after another draw", () => {
  const root = new Element();
  const actions = new Element(); actions.className = "app-randomizer-actions"; root.appendChild(actions);
  const link = new Element(); link.id = "resultLink"; link.tagName = "A"; link.href = "https://example.com/mirror/book.html?id=book-a&source=randomizer"; actions.appendChild(link);
  const messages = [];
  const listeners = {};
  let observe;
  const parent = { postMessage: (message) => messages.push(message) };
  const location = { pathname: "/mirror/randomizer.html", search: "", origin: "https://example.com", href: "https://example.com/mirror/randomizer.html" };
  const document = { documentElement: root, querySelector: (selector) => root.querySelector(selector), querySelectorAll: (selector) => selector === "a[href*='book']" ? [link] : root.querySelectorAll(selector), createElement: () => new Element(), addEventListener() {} };
  vm.runInNewContext(readFileSync(new URL("../public/mirror/includes/shared.js", import.meta.url), "utf8"), {
    window: { parent, location, addEventListener: (name, callback) => { listeners[name] = callback; } }, document, URL, URLSearchParams,
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {} },
  });
  const heart = actions.querySelector(".app-randomizer-heart");
  assert.ok(heart);
  assert.equal(actions.children[0], link);
  assert.equal(actions.children[1], heart);
  assert.equal(heart.parentElement, link.parentElement);
  listeners.message({ origin: location.origin, source: parent, data: { type: "blk-shelf-favorites-state", favorites: ["book-a"], shelf: {} } });
  assert.equal(heart.attributes["aria-pressed"], "true");
  link.href = "https://example.com/mirror/book.html?id=book-b&source=randomizer";
  observe(); observe();
  assert.equal(actions.querySelectorAll(".app-randomizer-heart").length, 1);
  assert.equal(heart.attributes["aria-pressed"], "false");
  heart.events.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(messages.at(-1).bookId, "book-b");
  assert.equal(messages.at(-1).type, "blk-shelf-toggle-favorite");
});

for (const pathname of ["/mirror/book.html", "/mirror/book", "/mirror/book/"]) {
test(`Book Spotlight ${pathname} has one heart and shelf control beneath the title`, async () => {
  const root = new Element();
  const toolbar = new Element(); toolbar.className = "app-spotlight-actions";
  const cover = new Element(); cover.className = "cover-actions";
  const main = new Element(); main.className = "book-main";
  root.appendChild(toolbar); root.appendChild(cover); root.appendChild(main);
  const messages = [];
  const listeners = {};
  let observe;
  const parent = { document: { querySelector: () => true }, postMessage: (payload) => messages.push(payload) };
  const location = { pathname, search: "?id=book-a", origin: "https://example.com", href: `https://example.com${pathname}?id=book-a`, replace: () => assert.fail("must stay inside app") };
  const document = { documentElement: root, querySelector: (s) => root.querySelector(s), querySelectorAll: (s) => root.querySelectorAll(s), createElement: () => new Element(), addEventListener: () => {} };
  const window = { parent, location, addEventListener: (name, fn) => { listeners[name] = fn; } };
  vm.runInNewContext(readFileSync(new URL("../public/mirror/includes/shared.js", import.meta.url), "utf8"), {
    window, document, URL, URLSearchParams,
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} },
    fetch: async () => ({ ok: true, json: async () => ({ count: 0, reviews: [] }) }),
  });
  for (let i = 0; i < 3; i++) observe();
  assert.equal(toolbar.querySelectorAll(".app-favorite-detail").length, 1);
  assert.equal(toolbar.querySelectorAll(".app-shelf-detail").length, 1);
  assert.equal(cover.children.length, 0);
  const heart = toolbar.querySelector(".app-favorite-detail");
  const shelf = toolbar.querySelector(".app-shelf-detail");
  assert.equal(heart.attributes["aria-pressed"], "false");
  assert.equal(shelf.textContent, "Add to My Shelf");
  const state = { type: "blk-shelf-favorites-state", favorites: ["book-a"], shelf: { "book-a": "Finished" } };
  listeners.message({ origin: "https://example.com", source: parent, data: state });
  assert.equal(heart.attributes["aria-pressed"], "true");
  assert.equal(shelf.textContent, "My Shelf · Read");
  assert.equal(shelf.classList.contains("is-on-shelf"), true);
  listeners.message({ origin: "https://untrusted.example", source: parent, data: { ...state, favorites: [], shelf: {} } });
  assert.equal(heart.attributes["aria-pressed"], "true");
  const event = { preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
  heart.events.click(event); shelf.events.click(event);
  assert.deepEqual(messages.slice(-2).map(({ type, bookId }) => [type, bookId]), [
    ["blk-shelf-toggle-favorite", "book-a"], ["blk-shelf-manage-book", "book-a"],
  ]);
  await Promise.resolve();
});
}

test("Discover uses the actual Library page, preserving all filter and sort controls", () => {
  const app = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const library = readFileSync(new URL("../public/mirror/library.html", import.meta.url), "utf8");
  const spotlight = readFileSync(new URL("../public/mirror/book.html", import.meta.url), "utf8");
  assert.ok(app.includes("/mirror/library.html?view=discover"));
  assert.ok(app.includes('embeddedScreen("Discover More", url, "home")'));
  for (const id of ["author-search", "genre-filters", "subgenre-filters", "vibe-filters", "age-filters", "spice-filters", "representation-filters", "format-filters", "length-filters", "sort-select"]) {
    assert.ok(library.includes(`id="${id}"`), `${id} is available to both pages`);
  }
  assert.ok(spotlight.includes('class="app-spotlight-actions"'));
});

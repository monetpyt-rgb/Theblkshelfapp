import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { localModule } from "./module-loader.mjs";

test("signup confirmation can be resent without signing in, changing a password, or creating another account", async () => {
  const source = readFileSync(new URL("../lib/reader-auth.ts", import.meta.url), "utf8").replace('"./supabase-config"', JSON.stringify(localModule("lib/supabase-config.ts")));
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const auth = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const calls = [];
  let rateLimited = false;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), ...init, body: JSON.parse(init.body) });
    if (rateLimited) return Response.json({ msg: "Please wait before requesting another email." }, { status: 429 });
    return Response.json({});
  };
  try {
    const redirect = "https://example.com";
    assert.equal(await auth.createReaderAccount("Reader", "reader@example.com", "test-password", redirect), null);
    await auth.resendReaderConfirmation(" reader@example.com ", redirect);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url.pathname, "/auth/v1/signup");
    assert.equal(calls[1].url.pathname, "/auth/v1/resend");
    assert.equal(calls[1].url.searchParams.get("redirect_to"), redirect);
    assert.equal(calls[1].method, "POST");
    assert.deepEqual(calls[1].body, { type: "signup", email: "reader@example.com" });
    assert.equal(calls[1].headers["Content-Type"], "application/json");
    assert.ok(calls[1].headers.apikey);
    // Resending must never send a password, request a session, or use an admin token.
    assert.equal(calls[1].headers.Authorization, undefined);
    for (const email of ["", "no-at-symbol", "reader@", "reader @example.com"]) {
      await assert.rejects(auth.resendReaderConfirmation(email, redirect), /Enter the email address/);
    }
    assert.equal(calls.length, 2);
    rateLimited = true;
    await assert.rejects(auth.resendReaderConfirmation("reader@example.com", redirect), /Please wait/);
    assert.equal(calls.length, 3);
    assert.ok(calls.slice(1).every((call) => call.url.pathname === "/auth/v1/resend"));
    globalThis.fetch = async () => Response.json({ code: "email_address_not_authorized", message: "Email address not authorized" }, { status: 403 });
    await assert.rejects(auth.resendReaderConfirmation("reader@example.com", redirect), /isn't configured/);
    globalThis.fetch = async () => Response.json({ code: "over_email_send_rate_limit", message: "Email rate limit exceeded" }, { status: 429 });
    await assert.rejects(auth.resendReaderConfirmation("reader@example.com", redirect), /sending limit/);
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(auth.resendReaderConfirmation("reader@example.com", redirect), /Couldn't connect/);
    // A stalled provider must release the UI's sending state with a useful error.
    globalThis.setTimeout = (callback) => originalSetTimeout(callback, 1);
    globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    await assert.rejects(auth.resendReaderConfirmation("reader@example.com", redirect), /taking too long/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

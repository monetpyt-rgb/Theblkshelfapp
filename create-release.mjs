import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const directory = new URL("../.app-runtime/", import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL("release.json", directory), JSON.stringify({ version: randomUUID() }));

import { readFileSync } from "node:fs";
import ts from "typescript";

export function moduleUrl(source) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}

const modules = new Map();
export function localModule(path) {
  if (modules.has(path)) return modules.get(path);
  let source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const dependencies = {
    '"./supabase-config"': "lib/supabase-config.ts",
    '"@/lib/reader-server"': "lib/reader-server.ts",
    '"@/lib/reader-storage"': "lib/reader-storage.ts",
    '"@/lib/review-rules"': "lib/review-rules.ts",
  };
  for (const [specifier, dependency] of Object.entries(dependencies)) if (source.includes(specifier)) source = source.replaceAll(specifier, JSON.stringify(localModule(dependency)));
  const url = moduleUrl(source);
  modules.set(path, url);
  return url;
}

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Converts an exact reader-data export to idempotent PostgreSQL import SQL. */
export function backupToSql(backup) {
  if (!backup?.complete || !backup?.tables) throw new Error("A complete reader backup is required.");
  const definitions = {
    reader_profiles: { target: "blk_shelf_reader_profiles", columns: ["user_id","display_name","updated_at"], keys: ["user_id"], date: "updated_at" },
    reader_shelves: { target: "blk_shelf_reader_shelves", columns: ["user_id","book_id","status","favorite","updated_at"], keys: ["user_id","book_id"], date: "updated_at" },
    reader_reviews: { target: "blk_shelf_reader_reviews", columns: ["user_id","book_id","id","rating","review","created_at","updated_at"], keys: ["user_id","book_id"], date: "updated_at" },
    reader_favorite_authors: { target: "blk_shelf_reader_favorite_authors", columns: ["user_id","author_id","created_at"], keys: ["user_id","author_id"], date: "created_at" },
    reader_dismissed_releases: { target: "blk_shelf_reader_dismissed_releases", columns: ["user_id","book_id","dismissed_at"], keys: ["user_id","book_id"], date: "dismissed_at" },
  };
  const literal = value => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Invalid number in backup."); return String(value); }
    if (typeof value !== "string" || value.includes("\0")) throw new Error("Invalid backup value.");
    return "'" + value.replaceAll("'", "''") + "'";
  };
  const lines = ["-- PRIVATE READER DATA. Run as owner in the same Supabase project after reader-schema.sql.", "-- Keep this file outside GitHub and public folders.", "BEGIN;", "SET LOCAL standard_conforming_strings = on;"];
  for (const [source, definition] of Object.entries(definitions)) {
    const rows = backup.tables[source];
    if (!Array.isArray(rows)) throw new Error(`Missing table: ${source}`);
    lines.push(`-- ${source}: ${rows.length} rows`);
    for (const raw of rows) {
      const row = { ...raw };
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.user_id)) throw new Error("Invalid reader account ID.");
      if (source === "reader_shelves") { row.favorite = Boolean(row.favorite) || row.status === "Favorites"; if (row.status === "Favorites") row.status = "Want to Read"; }
      const updates = definition.columns.filter(column => !definition.keys.includes(column) && column !== "id" && column !== "created_at");
      const conflict = updates.length ? `DO UPDATE SET ${updates.map(column => `${column}=EXCLUDED.${column}`).join(",")} WHERE EXCLUDED.${definition.date} >= saved.${definition.date}` : "DO NOTHING";
      lines.push(`INSERT INTO public.${definition.target} AS saved (${definition.columns.join(",")}) VALUES (${definition.columns.map(column => literal(row[column])).join(",")}) ON CONFLICT (${definition.keys.join(",")}) ${conflict};`);
    }
  }
  lines.push("COMMIT;", "");
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error("Usage: node scripts/reader-backup-to-sql.mjs BACKUP.json PRIVATE_OUTPUT.sql"); process.exit(1); }
  const sql = backupToSql(JSON.parse(readFileSync(input, "utf8")));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, sql, { mode: 0o600 });
  console.log("Private reader import SQL created.");
}

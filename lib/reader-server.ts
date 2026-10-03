import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config";

export function readerJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function authenticatedReader(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization } });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return typeof user.id === "string" && user.id ? user.id : null;
}

export async function catalogBookExists(bookId: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/public_library_books?select=Book_ID&Book_ID=eq.${encodeURIComponent(bookId)}&limit=1`, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!response.ok) throw new Error("The book catalog is unavailable.");
  const rows = await response.json() as { Book_ID?: string }[];
  return Array.isArray(rows) && rows.some((row) => row.Book_ID === bookId);
}

export function validBookId(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.trim().length <= 160;
}

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config";

/** Forward the reader's JWT so Postgres enforces ownership with auth.uid(). */
export async function readerRest<T>(request: Request, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: request.headers.get("authorization") || `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json", ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Reader database request failed (${response.status}).`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function readerRpc<T>(request: Request, name: string, payload: Record<string, unknown>) {
  return readerRest<T>(request, `rpc/${name}`, { method: "POST", body: JSON.stringify(payload) });
}

export function ownRows(table: string, userId: string, query: string) {
  return `${table}?user_id=eq.${encodeURIComponent(userId)}&${query}`;
}

export async function allOwnRows<T>(request: Request, table: string, userId: string, query: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await readerRest<T[]>(request, ownRows(table, userId, `${query}&limit=500&offset=${offset}`));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

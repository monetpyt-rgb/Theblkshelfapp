import type { ReaderSession } from "@/lib/reader-auth";

export async function readerApi<T>(path: string, session: ReaderSession | null, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "That request couldn't be completed. Please try again.");
  return payload;
}

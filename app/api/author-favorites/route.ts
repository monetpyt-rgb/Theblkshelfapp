import { authenticatedReader, readerJson as json, validBookId } from "@/lib/reader-server";
import { allOwnRows, ownRows, readerRest } from "@/lib/reader-storage";

export const dynamic = "force-dynamic";

async function preferences(request: Request, userId: string) {
  const [authors, dismissed] = await Promise.all([
    allOwnRows<{ author_id: string }>(request, "blk_shelf_reader_favorite_authors", userId, "select=author_id&order=created_at.desc,author_id"),
    allOwnRows<{ book_id: string }>(request, "blk_shelf_reader_dismissed_releases", userId, "select=book_id&order=book_id"),
  ]);
  return { authorIds: authors.map(row => row.author_id), dismissedBookIds: dismissed.map(row => row.book_id) };
}

async function handle(request: Request, operation: "read" | "favorite" | "dismiss") {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Log in to favorite authors and keep your release updates." }, 401);
    if (operation !== "read") {
      const payload = await request.json().catch(() => null);
      if (!payload || (operation === "favorite" ? !validBookId(payload.authorId) || typeof payload.favorite !== "boolean" : !validBookId(payload.bookId))) return json({ error: "Choose a valid author or book." }, 400);
      if (operation === "favorite") {
        const authorId = payload.authorId.trim();
        if (payload.favorite) await readerRest(request, "blk_shelf_reader_favorite_authors?on_conflict=user_id,author_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ user_id: userId, author_id: authorId }) });
        else await readerRest(request, ownRows("blk_shelf_reader_favorite_authors", userId, `author_id=eq.${encodeURIComponent(authorId)}`), { method: "DELETE" });
      } else {
        await readerRest(request, "blk_shelf_reader_dismissed_releases?on_conflict=user_id,book_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ user_id: userId, book_id: payload.bookId.trim() }) });
      }
    }
    return json(await preferences(request, userId));
  } catch { return json({ error: "Your author favorites couldn't sync. Please try again." }, 503); }
}

export const GET = (request: Request) => handle(request, "read");
export const PUT = (request: Request) => handle(request, "favorite");
export const POST = (request: Request) => handle(request, "dismiss");

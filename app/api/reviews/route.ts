import { authenticatedReader, catalogBookExists, readerJson as json, validBookId } from "@/lib/reader-server";
import { ownRows, readerRest, readerRpc } from "@/lib/reader-storage";
import { reviewError } from "@/lib/review-rules";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const bookId = query.get("bookId");
  if (!validBookId(bookId)) return json({ error: "Choose a valid book." }, 400);
  try {
    const userId = await authenticatedReader(request);
    if (request.headers.has("authorization") && !userId) return json({ error: "Please log in again to see your review." }, 401);
    const offset = Math.max(0, Math.min(100000, Math.floor(Number(query.get("offset")) || 0)));
    return json(await readerRpc(request, "blk_shelf_book_reviews", { p_book_id: bookId.trim(), p_offset: offset }));
  } catch { return json({ error: "Reviews are unavailable right now. Please try again." }, 503); }
}

export async function PUT(request: Request) {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Log in to rate or review books." }, 401);
    const payload = await request.json().catch(() => null);
    if (!payload || !validBookId(payload.bookId)) return json({ error: "Choose a valid book." }, 400);
    const review = payload.review === undefined ? "" : payload.review;
    const error = reviewError(payload.rating, review);
    if (error) return json({ error }, 400);
    const bookId = payload.bookId.trim();
    if (!await catalogBookExists(bookId)) return json({ error: "This book is not available on The BLK Shelf." }, 404);
    await readerRpc(request, "blk_shelf_set_review", { p_book_id: bookId, p_rating: payload.rating, p_review: (review as string).trim() });
    return json({ saved: true });
  } catch { return json({ error: "Your review couldn't be saved. Your draft is still here—please try again." }, 503); }
}

export async function DELETE(request: Request) {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Log in to remove your review." }, 401);
    const bookId = new URL(request.url).searchParams.get("bookId");
    if (!validBookId(bookId)) return json({ error: "Choose a valid book." }, 400);
    await readerRest(request, ownRows("blk_shelf_reader_reviews", userId, `book_id=eq.${encodeURIComponent(bookId.trim())}`), { method: "DELETE" });
    return json({ removed: true });
  } catch { return json({ error: "Your review couldn't be removed. Please try again." }, 503); }
}

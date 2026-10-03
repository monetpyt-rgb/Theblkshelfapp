import { authenticatedReader, readerJson as json, validBookId } from "@/lib/reader-server";
import { allOwnRows, ownRows, readerRest, readerRpc } from "@/lib/reader-storage";

export const dynamic = "force-dynamic";
const STATUSES = ["Want to Read", "Reading", "Finished", "Favorites"] as const;
type ShelfStatus = (typeof STATUSES)[number];
type ShelfRow = { book_id: string; status: ShelfStatus; favorite: boolean };
const validStatus = (value: unknown): value is ShelfStatus => typeof value === "string" && STATUSES.includes(value as ShelfStatus);

async function currentShelf(request: Request, userId: string) {
  const rows = await allOwnRows<ShelfRow>(request, "blk_shelf_reader_shelves", userId, "select=book_id,status,favorite&order=updated_at.desc,book_id");
  return {
    shelf: Object.fromEntries(rows.map(row => [row.book_id, row.status === "Favorites" ? "Want to Read" : row.status])),
    favorites: rows.filter(row => row.favorite || row.status === "Favorites").map(row => row.book_id),
  };
}

export async function GET(request: Request) {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Please log in to save books." }, 401);
    return json(await currentShelf(request, userId));
  } catch { return json({ error: "Your shelf is unavailable right now. Please try again." }, 503); }
}

export async function PUT(request: Request) {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Please log in to save books." }, 401);
    const payload = await request.json().catch(() => null);
    if (!payload || !validBookId(payload.bookId) || (payload.status !== undefined && !validStatus(payload.status)) || (payload.favorite !== undefined && typeof payload.favorite !== "boolean") || (payload.status === undefined && payload.favorite === undefined)) return json({ error: "Choose a valid book and shelf." }, 400);
    await readerRpc(request, "blk_shelf_set_book", { p_book_id: payload.bookId.trim(), p_status: payload.status ?? null, p_favorite: payload.favorite ?? null });
    return json(await currentShelf(request, userId));
  } catch { return json({ error: "That book couldn't be saved. Please try again." }, 503); }
}

export async function POST(request: Request) {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Please log in to save books." }, 401);
    const payload = await request.json().catch(() => null);
    if (!payload || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 500 || payload.items.some((item: { bookId?: unknown; status?: unknown } | null) => !item || !validBookId(item.bookId) || !validStatus(item.status))) return json({ error: "No valid shelf items were provided." }, 400);
    await readerRpc(request, "blk_shelf_import_books", { p_items: payload.items });
    return json(await currentShelf(request, userId));
  } catch { return json({ error: "Your saved books couldn't be synced. Please try again." }, 503); }
}

export async function DELETE(request: Request) {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Please log in to save books." }, 401);
    const bookId = new URL(request.url).searchParams.get("bookId");
    if (!validBookId(bookId)) return json({ error: "Choose a valid book." }, 400);
    await readerRest(request, ownRows("blk_shelf_reader_shelves", userId, `book_id=eq.${encodeURIComponent(bookId.trim())}`), { method: "DELETE" });
    return json(await currentShelf(request, userId));
  } catch { return json({ error: "That book couldn't be removed. Please try again." }, 503); }
}

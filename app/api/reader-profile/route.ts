import { authenticatedReader, readerJson as json } from "@/lib/reader-server";
import { readerRest, readerRpc } from "@/lib/reader-storage";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/review-rules";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Log in to see your profile." }, 401);
    const offset = Math.max(0, Math.min(100000, Math.floor(Number(new URL(request.url).searchParams.get("offset")) || 0)));
    return json(await readerRpc(request, "blk_shelf_get_profile", { p_offset: offset }));
  } catch { return json({ error: "Your profile couldn't be loaded. Please try again." }, 503); }
}

export async function PUT(request: Request) {
  try {
    const userId = await authenticatedReader(request);
    if (!userId) return json({ error: "Log in to update your public display name." }, 401);
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload.displayName !== "string" || payload.displayName.trim().length > MAX_DISPLAY_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(payload.displayName)) return json({ error: `Use a display name of up to ${MAX_DISPLAY_NAME_LENGTH} characters, or leave it blank.` }, 400);
    const displayName = payload.displayName.trim();
    await readerRest(request, "blk_shelf_reader_profiles?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: userId, display_name: displayName, updated_at: new Date().toISOString() }) });
    return json({ displayName });
  } catch { return json({ error: "Your display name couldn't be saved. Please try again." }, 503); }
}

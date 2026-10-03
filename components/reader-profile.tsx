"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReviewStars } from "@/components/book-reviews";
import { readerApi } from "@/lib/reader-api-client";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/review-rules";
import type { ReaderSession } from "@/lib/reader-auth";
import { toast } from "sonner";

type ProfileData = { displayName: string; reviewCount: number; reviews: { id: string; bookId: string; rating: number; review: string; updatedAt: string }[] };

export function ReaderProfile({ session, books, onReview, refreshKey = 0 }: { session: ReaderSession; books: { id: string; title: string }[]; onReview: (bookId: string) => void; refreshKey?: number }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    readerApi<ProfileData>("/api/reader-profile", session).then((profile) => { if (active) { setData(profile); setDisplayName(profile.displayName); } }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [session.access_token, revision, refreshKey]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const saved = await readerApi<{ displayName: string }>("/api/reader-profile", session, "PUT", { displayName });
      setDisplayName(saved.displayName);
      setData((current) => current ? { ...current, displayName: saved.displayName } : current);
      toast.success("Your public display name is saved.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your public name couldn't be saved."); }
    finally { setBusy(false); }
  }

  async function loadMore() {
    if (!data || moreBusy) return;
    setMoreBusy(true);
    try {
      const next = await readerApi<ProfileData>(`/api/reader-profile?offset=${data.reviews.length}`, session);
      setData((current) => current ? { ...current, reviewCount: next.reviewCount, reviews: [...current.reviews, ...next.reviews.filter((entry) => !current.reviews.some((existing) => existing.id === entry.id))] } : next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "More reviews couldn't be loaded."); }
    finally { setMoreBusy(false); }
  }

  return <section className="reader-profile-details">
    <h2>Your public name</h2>
    {!data ? <>{error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div> : <p>Loading your profile…</p>}</> : <>
      <form className="display-name-form" onSubmit={save}><label htmlFor="public-display-name">Display name (optional)</label><Input id="public-display-name" value={displayName} disabled={busy} maxLength={MAX_DISPLAY_NAME_LENGTH} onChange={(event) => setDisplayName(event.target.value)} placeholder="The name readers will see" autoComplete="nickname" /><p>This name appears on your public ratings and reviews. Leave it blank to appear as “Reader.” Your account email is never shown with your reviews.</p><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save display name"}</Button>{error ? <p role="alert" className="auth-message auth-error">{error}</p> : null}</form>
      <h2>Your ratings & reviews</h2>
      <p className="review-rule">One rating and review per book. You can update yours whenever you want.</p>
      {data.reviews.length ? <div className="profile-review-list">{data.reviews.map((entry) => <article className="public-review" key={entry.id}><h3>{books.find((book) => book.id === entry.bookId)?.title || "Book on The BLK Shelf"}</h3><ReviewStars rating={entry.rating} />{entry.review ? <p>{entry.review}</p> : null}<Button variant="outline" onClick={() => onReview(entry.bookId)}>View / edit review</Button></article>)}</div> : <p className="review-notice">Your ratings and reviews will appear here after you rate a book.</p>}
      {data.reviews.length < data.reviewCount ? <Button variant="outline" disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? "Loading…" : "More of your reviews"}</Button> : null}
    </>}
  </section>;
}

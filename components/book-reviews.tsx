"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { readerApi } from "@/lib/reader-api-client";
import { MAX_REVIEW_LENGTH, reviewError } from "@/lib/review-rules";
import type { ReaderSession } from "@/lib/reader-auth";

type Review = { id: string; rating: number; review: string; displayName: string; updatedAt: string };
type ReviewData = { reviews: Review[]; count: number; average: number; mine: Review | null; displayName: string };

export function ReviewStars({ rating }: { rating: number }) {
  return <span className="review-stars" aria-label={`${rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={17} fill={star <= rating ? "currentColor" : "none"} aria-hidden="true" />)}</span>;
}

export function BookReviews({ bookId, session, onLogin, onProfile }: { bookId: string; session: ReaderSession | null; onLogin: () => void; onProfile: () => void }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const draftTouched = useRef(false);
  const formId = useId();

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    readerApi<ReviewData>(`/api/reviews?bookId=${encodeURIComponent(bookId)}`, session).then((result) => {
      if (!active) return;
      setData(result);
      if (!draftTouched.current) { setRating(result.mine?.rating || 0); setReview(result.mine?.review || ""); }
    }).catch((failure) => { if (active) setLoadError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId, session?.access_token, revision]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session) { onLogin(); return; }
    const invalid = reviewError(rating, review);
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    try {
      await readerApi(`/api/reviews`, session, "PUT", { bookId, rating, review });
      draftTouched.current = false;
      setRevision((value) => value + 1);
      toast.success("Your rating and review are saved.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your review couldn't be saved."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!session) return;
    setBusy(true); setError("");
    try {
      await readerApi(`/api/reviews?bookId=${encodeURIComponent(bookId)}`, session, "DELETE");
      draftTouched.current = false; setRating(0); setReview(""); setRevision((value) => value + 1);
      toast.success("Your review was removed.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your review couldn't be removed."); }
    finally { setBusy(false); }
  }

  async function loadMore() {
    if (!data || moreBusy) return;
    setMoreBusy(true);
    try {
      const next = await readerApi<ReviewData>(`/api/reviews?bookId=${encodeURIComponent(bookId)}&offset=${data.reviews.length}`, session);
      setData((current) => current ? { ...next, reviews: [...current.reviews, ...next.reviews.filter((entry) => !current.reviews.some((existing) => existing.id === entry.id))] } : next);
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "More reviews couldn't be loaded."); }
    finally { setMoreBusy(false); }
  }

  return <section className="book-reviews" aria-label="Book ratings and reviews">
    <div className="reviews-heading"><h3>Ratings & reviews</h3>{data?.count ? <span><strong>{data.average.toFixed(1)}</strong> / 5 · {data.count} {data.count === 1 ? "rating" : "ratings"}</span> : null}</div>
    {loading ? <p className="review-notice"><LoaderCircle size={17} className="spin" /> Loading reviews…</p> : loadError ? <div role="alert" className="review-notice"><p>{loadError}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div> : <>
      {session ? <form className="review-form" onSubmit={submit}>
        <h4>{data?.mine ? "Your rating & review" : "Rate this book"}</h4>
        <p className="review-byline">Public name: <strong>{data?.displayName || "Reader"}</strong> <button type="button" onClick={onProfile}>Change in Profile</button></p>
        <RadioGroup className="rating-picker" aria-label="Your star rating" value={String(rating)} onValueChange={(value) => { draftTouched.current = true; setRating(Number(value)); setError(""); }} disabled={busy}>
          {[1, 2, 3, 4, 5].map((star) => <label key={star} className={star <= rating ? "selected" : ""} htmlFor={`${formId}-star-${star}`}><RadioGroupItem id={`${formId}-star-${star}`} value={String(star)} aria-label={`${star} ${star === 1 ? "star" : "stars"}`} /><Star size={24} fill={star <= rating ? "currentColor" : "none"} aria-hidden="true" /><span>{star}</span></label>)}
        </RadioGroup>
        <label htmlFor={`${formId}-review`}>Your review {rating > 3 ? "(optional)" : ""}</label>
        <Textarea id={`${formId}-review`} value={review} disabled={busy} maxLength={MAX_REVIEW_LENGTH} rows={5} aria-describedby={`${formId}-rule`} aria-invalid={Boolean(error)} onChange={(event) => { draftTouched.current = true; setReview(event.target.value); setError(""); }} placeholder="What worked for you—or what didn’t?" />
        <p id={`${formId}-rule`} className={`review-rule ${rating > 0 && rating <= 3 ? "required" : ""}`}>3 stars or lower: explain your rating in at least two complete sentences. Use punctuation at the end of each sentence. For 4–5 stars, a written review is optional.</p>
        {error ? <p className="auth-message auth-error" role="alert">{error}</p> : null}
        <div className="review-form-actions"><Button type="submit" disabled={busy || !rating}>{busy ? "Saving…" : data?.mine ? "Update review" : "Publish rating & review"}</Button>{data?.mine ? <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" disabled={busy}>Delete review</Button></AlertDialogTrigger><AlertDialogContent className="reader-auth-dialog"><AlertDialogHeader><AlertDialogTitle>Delete your rating and review?</AlertDialogTitle><AlertDialogDescription>This removes your public rating and review for this book.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>Delete review</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div>
      </form> : <div className="review-login"><p>Log in to rate or review this book.</p><Button onClick={onLogin}>Log in to review</Button></div>}
      <div className="public-reviews">{data?.reviews.length ? data.reviews.map((entry) => <article className="public-review" key={entry.id}><div><strong>{entry.displayName}</strong><ReviewStars rating={entry.rating} /></div><time dateTime={entry.updatedAt}>{new Date(entry.updatedAt).toLocaleDateString()}</time>{entry.review ? <p>{entry.review}</p> : <p className="rating-only">Rating only</p>}</article>) : <p className="review-notice">No ratings yet.</p>}</div>
      {data && data.reviews.length < data.count ? <Button variant="outline" onClick={() => void loadMore()} disabled={moreBusy}>{moreBusy ? "Loading…" : "More reviews"}</Button> : null}
    </>}
  </section>;
}

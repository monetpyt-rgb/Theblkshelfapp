"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight, Dices, ExternalLink, Heart, Home, LibraryBig, LoaderCircle, LockKeyhole, LogIn, LogOut, Search, Sparkles, Star, UserRound, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { createReaderAccount, readerDisplayName, resendReaderConfirmation, restoreReaderSession, signInReader, signOutReader, type ReaderSession } from "@/lib/reader-auth";
import { externalUrl } from "@/lib/external-links";
import { BookReviews } from "@/components/book-reviews";
import { ReaderProfile } from "@/components/reader-profile";
import { watchAppUpdates } from "@/lib/app-updates";
import { readerApi } from "@/lib/reader-api-client";
import { upcomingAuthorBooks } from "@/lib/author-releases";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase-config";

const DEFAULT_COVER = `${SUPABASE_URL}/storage/v1/object/public/defaults/cover-default.jpg`;
const DEFAULT_AUTHOR = `${SUPABASE_URL}/storage/v1/object/public/defaults/author-default.jpg`;
const LOGO = `${SUPABASE_URL}/storage/v1/object/public/logo/blkshelf-seal-cream.png`;
const SHELF_KEY = "the-blk-shelf-reader-shelf";
const CORE_VIBES = ["Everybody Got Issues", "Emotional Damage", "Plot gonna Plot", "Character-Driven", "Dark & Twisted", "Healing / Redemption"];

type View = "home" | "discover" | "search" | "authors" | "events" | "randomizer" | "shelf" | "profile" | "webpage";
type DiscoverMode = "all" | "trending" | "new" | "upcoming";
type ShelfStatus = "Want to Read" | "Reading" | "Finished" | "Favorites";
type PendingShelfAction = { bookId: string; status?: ShelfStatus | null; favorite?: boolean };
type ShelfData = { shelf: Record<string, ShelfStatus>; favorites: string[] };
type AuthorPreferences = { authorIds: string[]; dismissedBookIds: string[] };
type RawBook = {
  Book_ID?: string; Author_ID?: string; Author_Name?: string; Title?: string; CoverImagePath?: string;
  Genre?: string; Sub_Genres?: string; Vibes?: string; Spice_Level?: string; Age_Range?: string;
  "Release/Expected_Release_Date"?: string; Representation?: string; Word_Count?: number | null;
  Page_Count?: number | null; Series_Name?: string | null; Available_Formats?: string; Description?: string;
  Website_Link?: string; Amazon_Link?: string; BN_Link?: string; Bookfunnel_Link?: string;
  Kobo_Link?: string; Apple_Books_Link?: string; Other_Link?: string; Audiobook_Link?: string;
};
type RawAuthor = { AUTHOR_ID?: string; AUTHOR_NAME?: string; GENRES?: string; AUTHORIMAGEPATH?: string };
type RawFeatured = { Month_Key?: string; Author_ID?: string };
type RawRanking = { Book_ID?: string; Rank?: number; Click_Count?: number };
type Book = {
  id: string; authorId: string; author: string; title: string; cover: string; genre: string;
  subGenres: string[]; vibes: string[]; spice: string; ageRange: string; releaseDate: string;
  representation: string; formats: string;
};
type BookDetail = Book & {
  description: string; pageCount?: number | null; wordCount?: number | null; seriesName?: string | null;
  links: { label: string; url: string }[];
};
type Author = { id: string; name: string; genres: string[]; image: string };

function normalizeShelf(value: unknown): Record<string, ShelfStatus> {
  if (!value || typeof value !== "object") return {};
  const valid = new Set<ShelfStatus>(["Want to Read", "Reading", "Finished", "Favorites"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([bookId, status]) => [bookId, status === "Loved It" ? "Favorites" : status] as const)
      .filter((entry): entry is [string, ShelfStatus] => Boolean(entry[0]) && valid.has(entry[1] as ShelfStatus)),
  );
}

async function shelfRequest(session: ReaderSession, method: "GET" | "POST" | "PUT" | "DELETE", body?: unknown, bookId?: string) {
  const query = bookId ? `?bookId=${encodeURIComponent(bookId)}` : "";
  const response = await fetch(`/api/shelf${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as { shelf?: unknown; favorites?: string[]; error?: string };
  if (!response.ok) throw new Error(payload.error || "Your shelf couldn't be updated.");
  const normalized = normalizeShelf(payload.shelf);
  const favorites = Array.isArray(payload.favorites) ? payload.favorites.filter((id) => typeof id === "string") : Object.keys(normalized).filter((id) => normalized[id] === "Favorites");
  return { shelf: Object.fromEntries(Object.entries(normalized).map(([id, status]) => [id, status === "Favorites" ? "Want to Read" : status])) as Record<string, ShelfStatus>, favorites };
}

function list(value?: string | null) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
function coverUrl(path?: string) {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/covers/${encodeURIComponent(path)}` : DEFAULT_COVER;
}
function authorUrl(path?: string) {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/authors/${encodeURIComponent(path)}` : DEFAULT_AUTHOR;
}
function toBook(row: RawBook): Book {
  return {
    id: row.Book_ID ?? "", authorId: row.Author_ID ?? "", author: row.Author_Name || "Independent Author",
    title: row.Title || "Untitled", cover: coverUrl(row.CoverImagePath), genre: row.Genre || "Book",
    subGenres: list(row.Sub_Genres), vibes: list(row.Vibes), spice: row.Spice_Level || "",
    ageRange: row.Age_Range || "", releaseDate: row["Release/Expected_Release_Date"] || "",
    representation: row.Representation || "", formats: row.Available_Formats || "",
  };
}
function toDetail(row: RawBook): BookDetail {
  const links = [
    ["Author website", row.Website_Link], ["Amazon", row.Amazon_Link], ["Barnes & Noble", row.BN_Link],
    ["BookFunnel", row.Bookfunnel_Link], ["Kobo", row.Kobo_Link], ["Apple Books", row.Apple_Books_Link],
    ["Audiobook", row.Audiobook_Link], ["Other retailer", row.Other_Link],
  ].map(([label, url]) => ({ label: label || "Retailer", url: externalUrl(url) })).filter((link) => link.url);
  return { ...toBook(row), description: row.Description || "More details are coming to the shelf soon.", pageCount: row.Page_Count, wordCount: row.Word_Count, seriesName: row.Series_Name, links };
}
async function fetchPaged<T>(path: string, maxPages = 8): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * 500;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      cache: "no-store",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: "application/json", Range: `${from}-${from + 499}` },
    });
    if (!response.ok) throw new Error(`Shelf request failed: ${response.status}`);
    const pageRows = (await response.json()) as T[];
    rows.push(...pageRows);
    if (pageRows.length < 500) break;
  }
  return rows;
}
function dateValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function dateLabel(value: string) {
  const date = dateValue(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "";
}
function currentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
function ShelfPicker({ title, status, onChange, id }: { title: string; status?: ShelfStatus; onChange: (value: string) => void; id?: string }) {
  return <Select value={status || "remove"} onValueChange={onChange}><SelectTrigger id={id} className="shelf-picker" data-saved={Boolean(status)} aria-label={`My Shelf selection for ${title}`}><LibraryBig className="shelf-picker-icon" size={17} /><SelectValue>{status === "Finished" ? "Read" : status || "Add to My Shelf"}</SelectValue></SelectTrigger><SelectContent className="shelf-picker-menu" position="popper"><SelectItem value="Want to Read">Want to Read</SelectItem><SelectItem value="Reading">Reading</SelectItem><SelectItem value="Finished">Read</SelectItem><SelectItem value="remove">{status ? "Remove from My Shelf" : "Not on My Shelf"}</SelectItem></SelectContent></Select>;
}

function BookCard({ book, status, favorite, onOpen, onQuickSave, onStatusChange, rank }: {
  book: Book; status?: ShelfStatus; favorite?: boolean; onOpen: (book: Book) => void; onQuickSave: (book: Book) => void; onStatusChange: (book: Book, status: string) => void; rank?: number;
}) {
  const isFavorite = Boolean(favorite);
  return (
    <article className="book-card" onClick={() => onOpen(book)}>
      <button type="button" className={`save-button ${isFavorite ? "is-saved" : ""}`} aria-pressed={isFavorite} aria-label={isFavorite ? `Remove ${book.title} from Favorites` : `Add ${book.title} to Favorites`} onClick={(event) => { event.stopPropagation(); onQuickSave(book); }}>
        <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
      </button>
      {rank ? <span className="rank-badge">#{rank}</span> : null}
      <div className="cover-shell"><img src={book.cover} alt={`${book.title} cover`} loading="lazy" onError={(event) => { event.currentTarget.src = DEFAULT_COVER; }} /></div>
      <div className="book-copy"><p className="book-genre">{book.genre}</p><h3>{book.title}</h3><p className="book-author">{book.author}</p></div>
      <div className="card-shelf-control" onClick={(event) => event.stopPropagation()}><ShelfPicker title={book.title} status={status} onChange={(value) => onStatusChange(book, value)} /></div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: { label: string; onClick: () => void } }) {
  return <div className="section-heading"><div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h2>{title}</h2></div>{action ? <button type="button" className="text-action" onClick={action.onClick}>{action.label} <ChevronRight size={16} /></button> : null}</div>;
}
function LoadingShelf() {
  return <div className="book-row" aria-label="Loading books">{[0, 1, 2, 3].map((item) => <div className="loading-book" key={item}><Skeleton className="loading-cover" /><Skeleton className="loading-line" /><Skeleton className="loading-line short" /></div>)}</div>;
}

export default function BlkShelfApp() {
  const [view, setView] = useState<View>("home");
  const [embeddedPage, setEmbeddedPage] = useState<{ title: string; url: string; returnView: View } | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [featuredAuthorIds, setFeaturedAuthorIds] = useState<string[]>([]);
  const [rankedIds, setRankedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [activeVibe, setActiveVibe] = useState("");
  const [discoverMode, setDiscoverMode] = useState<DiscoverMode>("all");
  const [shelf, setShelf] = useState<Record<string, ShelfStatus>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [authorPreferences, setAuthorPreferences] = useState<AuthorPreferences>({ authorIds: [], dismissedBookIds: [] });
  const [authorLoadError, setAuthorLoadError] = useState(false);
  const [authorBusy, setAuthorBusy] = useState(false);
  const authorSaving = useRef(false);
  const [pendingAuthorAction, setPendingAuthorAction] = useState<{ authorId: string; favorite: boolean } | null>(null);
  const shelfSaving = useRef(false);
  const [readerSession, setReaderSession] = useState<ReaderSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const resendLock = useRef(false);
  const [pendingShelfAction, setPendingShelfAction] = useState<PendingShelfAction | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [socialLink, setSocialLink] = useState<{ url: string; label: string } | null>(null);
  const [manageBookId, setManageBookId] = useState<string | null>(null);
  const [reviewBookId, setReviewBookId] = useState<string | null>(null);
  const [profileRevision, setProfileRevision] = useState(0);
  const [contentRevision, setContentRevision] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => watchAppUpdates({
    canRefresh: () => {
      if (shelfSaving.current || authorSaving.current || document.querySelector('[role="dialog"], form, textarea')) return false;
      return !Array.from(document.querySelectorAll<HTMLIFrameElement>(".embedded-site-frame")).some((frame) => {
        try { return Boolean(frame.contentDocument?.querySelector("form, textarea")); }
        catch { return true; }
      });
    },
    refreshContent: () => {
      setContentRevision((value) => value + 1);
      setProfileRevision((value) => value + 1);
      document.querySelectorAll<HTMLIFrameElement>(".embedded-site-frame").forEach((frame) => {
        try {
          if (!frame.contentWindow) return;
          const destination = new URL(frame.contentWindow.location.href);
          if (destination.origin !== window.location.origin) return;
          destination.searchParams.set("_refresh", String(Date.now()));
          frame.contentWindow.location.replace(destination.href);
        } catch { /* An iframe that is still loading will use fresh data on load. */ }
      });
    },
  }), []);

  useEffect(() => {
    if (!resendAvailableAt) return;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setResendSeconds(remaining);
      if (!remaining) setResendAvailableAt(0);
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  useEffect(() => {
    const bookId = new URLSearchParams(window.location.search).get("bookId");
    if (bookId && bookId.trim().length <= 160) {
      setEmbeddedPage({ title: "Book Spotlight", url: `/mirror/book.html?id=${encodeURIComponent(bookId.trim())}&source=app`, returnView: "home" });
      setView("webpage");
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Account storage is authoritative; never overwrite it with another device's cache.
    restoreReaderSession().then(async (session) => {
      if (!active) return;
      if (session) {
        setReaderSession(session);
        try {
          const syncedShelf = await shelfRequest(session, "GET");
          if (active) applyShelfData(syncedShelf);
        } catch {
          if (active) toast.error("Your account is connected, but your shelf couldn't sync yet.");
        }
      }
      if (active) setAuthReady(true);
    });
    return () => { active = false; };
  }, [contentRevision]);
  useEffect(() => {
    let active = true;
    if (!readerSession) { setAuthorPreferences({ authorIds: [], dismissedBookIds: [] }); setAuthorLoadError(false); return; }
    readerApi<AuthorPreferences>("/api/author-favorites", readerSession).then((data) => {
      if (active) { setAuthorPreferences(data); setAuthorLoadError(false); }
    }).catch(() => { if (active) setAuthorLoadError(true); });
    return () => { active = false; };
  }, [readerSession, contentRevision]);
  useEffect(() => {
    let active = true;
    async function loadShelf() {
      try {
        const [bookRows, authorRows, featuredRows, rankingRows] = await Promise.all([
          fetchPaged<RawBook>("public_library_books?select=*"),
          fetchPaged<RawAuthor>("public_authors?select=*&APPROVAL=eq.Approved", 4),
          fetchPaged<RawFeatured>("public_featured_authors?select=*", 2),
          fetchPaged<RawRanking>("public_weekly_rankings?select=*&order=Week_Key.desc,Rank.asc&limit=10", 1),
        ]);
        if (!active) return;
        setBooks(bookRows.map(toBook).filter((book) => book.id));
        setLoadError(false);
        setAuthors(authorRows.map((row) => ({ id: row.AUTHOR_ID ?? "", name: row.AUTHOR_NAME || "Independent Author", genres: list(row.GENRES), image: authorUrl(row.AUTHORIMAGEPATH) })).filter((author) => author.id));
        const currentMonth = currentMonthKey();
        setFeaturedAuthorIds(featuredRows.filter((row) => row.Month_Key === currentMonth).map((row) => row.Author_ID || "").filter(Boolean));
        setRankedIds(rankingRows.sort((a, b) => Number(a.Rank || 999) - Number(b.Rank || 999)).map((row) => row.Book_ID || "").filter(Boolean));
      } catch { if (active) setLoadError(true); }
      finally { if (active) setLoading(false); }
    }
    loadShelf(); return () => { active = false; };
  }, [contentRevision]);
  useEffect(() => { if (view === "search") window.setTimeout(() => searchRef.current?.focus(), 80); }, [view]);
  useEffect(() => {
    function sendFavorites(target: Window | null = null) {
      const payload = { type: "blk-shelf-favorites-state", favorites, shelf, authorFavorites: authorPreferences.authorIds };
      if (target) target.postMessage(payload, window.location.origin);
      else document.querySelectorAll<HTMLIFrameElement>(".embedded-site-frame").forEach((frame) => frame.contentWindow?.postMessage(payload, window.location.origin));
    }
    function handleMirrorMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
      const frame = Array.from(document.querySelectorAll<HTMLIFrameElement>(".embedded-site-frame")).find((frame) => frame.contentWindow === event.source);
      if (!frame) return;
      if (event.data.type === "blk-shelf-external-link") {
        const url = externalUrl(event.data.url);
        if (url) setSocialLink({ url, label: String(event.data.label || "social profile").slice(0, 60) });
        return;
      }
      if (event.data.type === "blk-shelf-favorites-ready") {
        sendFavorites(frame.contentWindow);
        return;
      }
      if (event.data.type === "blk-shelf-toggle-author") {
        const authorId = typeof event.data.authorId === "string" ? event.data.authorId.trim() : "";
        if (authorId && authorId.length <= 160) void persistAuthorFavorite(authorId, !authorPreferences.authorIds.includes(authorId));
        return;
      }
      if (!["blk-shelf-toggle-favorite", "blk-shelf-status", "blk-shelf-manage-book", "blk-shelf-open-reviews"].includes(event.data.type)) return;
      const bookId = typeof event.data.bookId === "string" ? event.data.bookId.trim() : "";
      if (!bookId || bookId.length > 160) return;
      if (event.data.type === "blk-shelf-open-reviews") { setReviewBookId(bookId); return; }
      if (event.data.type === "blk-shelf-manage-book") { setManageBookId(bookId); return; }
      if (event.data.type === "blk-shelf-toggle-favorite") void persistShelfAction({ bookId, favorite: !favorites.includes(bookId) });
      else if (["Want to Read", "Reading", "Finished", "remove"].includes(event.data.status)) void persistShelfAction({ bookId, status: event.data.status === "remove" ? null : event.data.status });
    }
    window.addEventListener("message", handleMirrorMessage);
    sendFavorites();
    return () => window.removeEventListener("message", handleMirrorMessage);
  }, [shelf, favorites, readerSession, authorPreferences]);

  const featuredAuthors = useMemo(() => {
    const byId = new Map(authors.map((author) => [author.id, author]));
    return featuredAuthorIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 4) as Author[];
  }, [authors, featuredAuthorIds]);
  const rankedBooks = useMemo(() => {
    const byId = new Map(books.map((book) => [book.id, book]));
    const ranked = rankedIds.map((id) => byId.get(id)).filter(Boolean) as Book[];
    return ranked.length ? ranked : books.slice(0, 10);
  }, [books, rankedIds]);
  const freshBooks = useMemo(() => [...books].filter((book) => dateValue(book.releaseDate)).sort((a, b) => Math.abs((dateValue(a.releaseDate)?.getTime() || 0) - Date.now()) - Math.abs((dateValue(b.releaseDate)?.getTime() || 0) - Date.now())).slice(0, 12), [books]);
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return books.filter((book) => {
      const haystack = [book.title, book.author, book.genre, book.subGenres.join(" "), book.vibes.join(" "), book.representation].join(" ").toLowerCase();
      return (!needle || haystack.includes(needle)) && (!activeVibe || book.vibes.includes(activeVibe));
    });
  }, [books, query, activeVibe]);
  const shelfBooks = useMemo(() => books.filter((book) => shelf[book.id]), [books, shelf]);
  const authorReleases = useMemo(() => upcomingAuthorBooks(books, authorPreferences.authorIds, shelf, authorPreferences.dismissedBookIds), [books, authorPreferences, shelf]);
  const shelfCounts = useMemo(() => ["Want to Read", "Reading", "Finished", "Favorites"].map((status) => ({ status: status as ShelfStatus, count: status === "Favorites" ? favorites.length : Object.values(shelf).filter((value) => value === status).length })), [shelf, favorites]);
  function applyShelfData(data: ShelfData) { setShelf(data.shelf); setFavorites(data.favorites); }
  function openDiscover(mode: DiscoverMode = "all") { setDiscoverMode(mode); setView("discover"); }

  function openAuth(mode: "login" | "signup" = "signup", action: PendingShelfAction | null = null) {
    setAuthMode(mode);
    setPendingShelfAction(action);
    setPendingAuthorAction(null);
    setAuthError("");
    setAuthNotice("");
    setAuthDialogOpen(true);
  }

  async function persistAuthorFavorite(authorId: string, favorite: boolean, session = readerSession) {
    if (!session) { openAuth("login"); setPendingAuthorAction({ authorId, favorite }); return; }
    if (authorSaving.current) return;
    authorSaving.current = true; setAuthorBusy(true);
    try {
      const data = await readerApi<AuthorPreferences>("/api/author-favorites", session, "PUT", { authorId, favorite });
      setAuthorPreferences(data); setAuthorLoadError(false);
      toast.success(favorite ? "Author favorited. Upcoming books will appear in My Shelf." : "Author removed from Favorites");
    } catch (error) { toast.error(error instanceof Error ? error.message : "This author couldn't be saved."); }
    finally { authorSaving.current = false; setAuthorBusy(false); }
  }

  async function dismissRelease(bookId: string) {
    if (!readerSession || authorSaving.current) return;
    authorSaving.current = true; setAuthorBusy(true);
    try { setAuthorPreferences(await readerApi<AuthorPreferences>("/api/author-favorites", readerSession, "POST", { bookId })); }
    catch (error) { toast.error(error instanceof Error ? error.message : "This update couldn't be dismissed."); }
    finally { authorSaving.current = false; setAuthorBusy(false); }
  }

  function authorHeart(authorId: string, name: string, iconOnly = false) {
    const saved = authorPreferences.authorIds.includes(authorId);
    return <button type="button" className={`author-heart ${iconOnly ? "author-heart-icon" : ""} ${saved ? "is-saved" : ""}`} disabled={authorBusy} aria-pressed={saved} aria-label={`${saved ? "Unfavorite" : "Favorite"} ${name}`} onClick={() => void persistAuthorFavorite(authorId, !saved)}><Heart size={iconOnly ? 16 : 18} fill={saved ? "currentColor" : "none"} />{iconOnly ? null : saved ? "Author favorited" : "Favorite author"}</button>;
  }

  async function persistShelfAction(action: PendingShelfAction, session = readerSession) {
    if (!session) {
      openAuth("signup", action);
      return;
    }

    if (shelfSaving.current) { toast("Please wait for your book to finish saving."); return; }
    shelfSaving.current = true;

    try {
      const synced = action.status !== null
        ? await shelfRequest(session, "PUT", action)
        : await shelfRequest(session, "DELETE", undefined, action.bookId);
      applyShelfData(synced);
      toast.success(action.favorite !== undefined ? action.favorite ? "Added to Favorites" : "Removed from Favorites" : action.status ? `Marked as ${action.status === "Finished" ? "Read" : action.status}` : "Removed from My Shelf");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your shelf couldn't be updated.");
    } finally { shelfSaving.current = false; }
  }

  async function finishSignIn(session: ReaderSession) {
    const syncedShelf = await shelfRequest(session, "GET");
    setReaderSession(session);
    applyShelfData(syncedShelf);
    const action = pendingShelfAction;
    const authorAction = pendingAuthorAction;
    setPendingAuthorAction(null);
    setPendingShelfAction(null);
    setAuthDialogOpen(false);
    setAuthPassword("");
    if (authorAction) await persistAuthorFavorite(authorAction.authorId, authorAction.favorite, session);
    else if (action) await persistShelfAction(action, session);
    else toast.success("You're logged in. Your shelf is synced.");
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authBusy || resendLock.current) return;
    setAuthError("");
    setAuthNotice("");
    if (authMode === "signup" && !authName.trim()) { setAuthError("Enter your name."); return; }
    if (!authEmail.includes("@")) { setAuthError("Enter a valid email address."); return; }
    if (authPassword.length < 8) { setAuthError("Your password needs at least 8 characters."); return; }

    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        const session = await createReaderAccount(authName, authEmail.trim(), authPassword, window.location.origin);
        if (!session) {
          setAuthNotice("Check your inbox or spam folder to confirm your account, then come back and log in.");
          startResendCooldown();
          setAuthMode("login");
          setAuthPassword("");
          return;
        }
        await finishSignIn(session);
      } else {
        await finishSignIn(await signInReader(authEmail.trim(), authPassword));
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "We couldn't log you in.");
    } finally {
      setAuthBusy(false);
    }
  }

  function startResendCooldown() {
    setResendSeconds(60);
    setResendAvailableAt(Date.now() + 60_000);
  }

  async function resendConfirmation() {
    if (authBusy || resendLock.current || Date.now() < resendAvailableAt) return;
    resendLock.current = true;
    setResendBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      await resendReaderConfirmation(authEmail, window.location.origin);
      startResendCooldown();
      setAuthNotice("Confirmation email requested. Check your inbox and spam folder, then use the latest link to confirm your account.");
      toast.success("Confirmation email requested. Check your inbox and spam folder.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't resend your confirmation email. Please try again.";
      setAuthError(message);
      toast.error(message);
    } finally {
      resendLock.current = false;
      setResendBusy(false);
    }
  }

  async function handleSignOut() {
    await signOutReader(readerSession);
    setReaderSession(null);
    setShelf({});
    setFavorites([]);
    setAuthorPreferences({ authorIds: [], dismissedBookIds: [] });
    setPendingAuthorAction(null);
    window.localStorage.removeItem(SHELF_KEY);
    toast("You're logged out.");
  }

  function quickSave(book: Book) {
    void persistShelfAction({ bookId: book.id, favorite: !favorites.includes(book.id) });
  }
  function updateShelfStatus(book: Book, value: string) {
    void persistShelfAction({ bookId: book.id, status: value === "remove" ? null : value as ShelfStatus });
  }
  async function openBook(book: Book) {
    setSelectedBook(book); setDetail(null); setDetailLoading(true);
    try {
      const rows = await fetchPaged<RawBook>(`public_books?select=*&Book_ID=eq.${encodeURIComponent(book.id)}&Is_Live=eq.Yes&limit=1`, 1);
      setDetail(rows[0] ? toDetail(rows[0]) : { ...book, description: "", links: [] });
    } catch { setDetail({ ...book, description: "", links: [] }); }
    finally { setDetailLoading(false); }
  }
  function openVibe(vibe: string) { setActiveVibe(vibe); setQuery(""); setView("search"); }
  function openEmbeddedPage(title: string, url: string) {
    setEmbeddedPage({ title, url, returnView: view === "webpage" ? "home" : view });
    setView("webpage");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function renderBookRow(items: Book[], withRank = false) {
    if (loading) return <LoadingShelf />;
    return <div className="book-row">{items.map((book, index) => <BookCard key={book.id} book={book} rank={withRank ? index + 1 : undefined} status={shelf[book.id]} favorite={favorites.includes(book.id)} onStatusChange={updateShelfStatus} onOpen={openBook} onQuickSave={quickSave} />)}</div>;
  }

  function homeScreen() {
    return <>
      <div className="app-promo-banner">
       <button  type="button"  className="app-promo-link"aria-label="Open featured promotion"  onClick={() => window.open("https://www.brae.website/", "_blank", "noopener,noreferrer")}

          <img className="app-promo-image app-promo-desktop" src="https://njgprucvnayyiooiftaw.supabase.co/storage/v1/object/public/ads/BRAE-Banner-1920.png" alt="Featured promotion" />
          <img className="app-promo-image app-promo-mobile" src="https://njgprucvnayyiooiftaw.supabase.co/storage/v1/object/public/ads/BRAE-Banner-1080.png" alt="Featured promotion" />
        </button>
      </div>
      <section className="discovery-hero">
        <div className="hero-orbit" aria-hidden="true"><Sparkles size={18} /></div>
        <p className="eyebrow">Black indie books, curated by mood</p>
        <h1>Where Black indie stories get found.</h1>
        <div className="hero-actions">
          <button type="button" className="hero-search" onClick={() => setView("search")}><Search size={19} /><span>Search by title, author, genre, or vibe</span></button>
          <button type="button" className="discover-more-button" onClick={() => openDiscover()}><Sparkles size={18} /> Discover More</button>
        </div>
        <div className="hero-stats"><span><strong>{books.length || "—"}</strong> books on the shelf</span><span><strong>{authors.length || "—"}</strong> Black indie authors</span></div>
      </section>
      <section className="content-section first-section">
        <SectionHeading eyebrow="Weekly rankings" title="Trending now" action={{ label: "See all", onClick: () => openDiscover("trending") }} />
        {renderBookRow(rankedBooks, true)}
      </section>
      <section className="content-section vibe-section">
        <SectionHeading eyebrow="Browse by vibe" title="What are you in the mood for?" />
        <div className="vibe-grid">{CORE_VIBES.map((vibe, index) => <button type="button" className={`vibe-card vibe-${index + 1}`} key={vibe} onClick={() => openVibe(vibe)}><span>{vibe}</span><ChevronRight size={18} /></button>)}</div>
      </section>
      <section className="content-section">
        <SectionHeading eyebrow="New & upcoming" title="Fresh from the shelf" action={{ label: "Discover", onClick: () => openDiscover() }} />
        {renderBookRow(freshBooks)}
      </section>
      <section className="content-section author-section">
        <SectionHeading eyebrow="Featured authors" title="Meet the writers behind the stories" />
        <div className="author-row">{loading ? [0, 1, 2, 3].map((item) => <Skeleton className="author-skeleton" key={item} />) : featuredAuthors.map((author) => <div className="author-card-with-heart" key={author.id}><button type="button" className="author-card" onClick={() => openEmbeddedPage(author.name, `/mirror/author.html?id=${encodeURIComponent(author.id)}&source=app`)}><img src={author.image} alt={author.name} loading="lazy" onError={(event) => { event.currentTarget.src = DEFAULT_AUTHOR; }} /><div><h3>{author.name}</h3><p>{author.genres.slice(0, 2).join(" • ") || "Featured author"}</p></div></button>{authorHeart(author.id, author.name, true)}</div>)}</div>
      </section>
    </>;
  }

  function discoverScreen() {
    const labels: Record<DiscoverMode, string> = { all: "All books", trending: "Trending", new: "New releases", upcoming: "Upcoming" };
    const ranking: Record<DiscoverMode, string> = { all: "", trending: "trending", new: "new-releases", upcoming: "upcoming-releases" };
    const url = `/mirror/library.html?view=discover${ranking[discoverMode] ? `&ranking=${ranking[discoverMode]}` : ""}`;
    return <section className="discover-library-screen">
      <div className="filter-chips discover-quick-filters" role="group" aria-label="Discovery shortcuts">{(Object.keys(labels) as DiscoverMode[]).map((mode) => <button type="button" key={mode} className={discoverMode === mode ? "active" : ""} aria-pressed={discoverMode === mode} onClick={() => setDiscoverMode(mode)}>{labels[mode]}</button>)}</div>
      {embeddedScreen("Discover More", url, "home")}
    </section>;
  }

  function searchScreen() {
    return <section className="screen-section search-screen">
      <div className="search-title-row"><div><p className="eyebrow">Search the shelf</p><h1>What do you want to feel?</h1></div>{activeVibe ? <button type="button" className="clear-vibe" onClick={() => setActiveVibe("")}>Clear vibe <X size={14} /></button> : null}</div>
      <label className="search-field"><Search size={20} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, author, genre, vibe…" aria-label="Search books" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={18} /></button> : null}</label>
      <div className="vibe-scroll" aria-label="Vibe filters">{CORE_VIBES.map((vibe) => <button type="button" key={vibe} className={activeVibe === vibe ? "active" : ""} onClick={() => setActiveVibe(activeVibe === vibe ? "" : vibe)}>{vibe}</button>)}</div>
      <p className="result-count">{loading ? "Searching the shelf…" : `${searchResults.length.toLocaleString()} matches`}</p>
      {!loading && searchResults.length === 0 ? <div className="empty-state"><BookOpen size={30} /><h2>No books matched that search.</h2><p>Try a title, author name, genre, or another vibe.</p></div> : <div className="book-grid">{searchResults.slice(0, 100).map((book) => <BookCard key={book.id} book={book} status={shelf[book.id]} favorite={favorites.includes(book.id)} onStatusChange={updateShelfStatus} onOpen={openBook} onQuickSave={quickSave} />)}</div>}
    </section>;
  }

  function shelfScreen() {
    return <section className="screen-section">
      <div className="screen-intro"><p className="eyebrow">My Shelf</p><h1>Your reading stays with you.</h1><p>Save what caught your eye, then move it as you read.</p></div>
      {!readerSession ? <div className="shelf-sync-card"><LockKeyhole size={22} /><div><strong>Log in to keep your shelf</strong><p>Your saved books and Favorites will follow you across every device.</p></div><button type="button" onClick={() => openAuth("signup")}>Create account</button></div> : null}
      <div className="shelf-summary">{shelfCounts.map(({ status, count }) => <div key={status}><strong>{count}</strong><span>{status === "Finished" ? "Read" : status}</span></div>)}</div>
      {readerSession ? <section className="author-updates" aria-label="Updates from favorite authors">
        <SectionHeading eyebrow="Upcoming releases" title="New from your authors" />
        {authorLoadError ? <p role="status">Your author updates couldn't load. <button type="button" className="author-heart" onClick={() => setContentRevision((value) => value + 1)}>Try again</button></p> : authorReleases.length ? <div className="release-notice-grid">{authorReleases.map((book) => <article className="release-notice" key={book.id}>
          <button type="button" className="release-cover" onClick={() => openBook(book)} aria-label={`Open ${book.title}`}><img src={book.cover} alt="" onError={(event) => { event.currentTarget.src = DEFAULT_COVER; }} /></button>
          <div className="release-notice-copy"><p className="eyebrow">Upcoming · {dateLabel(book.releaseDate)}</p><button type="button" className="release-title" onClick={() => openBook(book)}>{book.title}</button><p>by {book.author}</p><div className="release-actions"><button type="button" className="author-heart" onClick={() => updateShelfStatus(book, "Want to Read")}><LibraryBig size={16} />Add to Want to Read</button><button type="button" className="release-dismiss" disabled={authorBusy} onClick={() => void dismissRelease(book.id)}>Dismiss</button></div></div>
        </article>)}</div> : <p className="author-updates-empty">{authorPreferences.authorIds.length ? "You're caught up. Upcoming books will appear here as they're added to The BLK Shelf." : "Heart an author to see their upcoming books here. You choose which ones go on your shelf."}</p>}
        <div className="favorite-authors-list">{authorPreferences.authorIds.map((id) => { const author = authors.find((item) => item.id === id); return <div className="favorite-author-item" key={id}><button type="button" onClick={() => openEmbeddedPage(author?.name || "Favorite author", `/mirror/author.html?id=${encodeURIComponent(id)}&source=app`)}>{author?.name || "Favorite author"}</button>{authorHeart(id, author?.name || "this author")}</div>; })}</div>
        {!authorPreferences.authorIds.length ? <button type="button" className="author-heart" onClick={() => setView("authors")}>Find authors</button> : null}
      </section> : null}
      {shelfBooks.length ? <div className="shelf-groups">{shelfCounts.map(({ status, count }) => count ? <section key={status}><SectionHeading title={status === "Finished" ? "Read" : status} /><div className="book-row">{shelfBooks.filter((book) => status === "Favorites" ? favorites.includes(book.id) : shelf[book.id] === status).map((book) => <BookCard key={book.id} book={book} status={shelf[book.id]} favorite={favorites.includes(book.id)} onStatusChange={updateShelfStatus} onOpen={openBook} onQuickSave={quickSave} />)}</div></section> : null)}</div> : <div className="empty-state shelf-empty"><LibraryBig size={34} /><h2>Your shelf is waiting.</h2><p>Favorite a book or choose a reading status to save it here.</p><button type="button" className="primary-button" onClick={() => openDiscover()}>Discover books</button></div>}
    </section>;
  }

  function profileScreen() {
    return <section className="screen-section profile-screen">
      <div className="profile-hero"><img src={LOGO} alt="The BLK Shelf seal" /><p className="eyebrow">The BLK Shelf</p><h1>Built for Black indie stories to be found.</h1><p>Discover by mood, story, genre, and the voices traditional algorithms overlook.</p></div>
      <div className="reader-account-card">
        {!authReady ? <><div className="account-icon"><LoaderCircle size={23} className="spin" /></div><div className="account-copy"><strong>Checking your account…</strong><p>Getting your shelf ready.</p></div></> : readerSession ? <><div className="account-avatar">{readerDisplayName(readerSession).charAt(0).toUpperCase()}</div><div className="account-copy"><span>Reader account</span><strong>{readerDisplayName(readerSession)}</strong><p>{readerSession.user.email}</p></div><button type="button" className="account-quiet-button" onClick={() => void handleSignOut()}><LogOut size={16} /> Log out</button></> : <><div className="account-icon"><Star size={23} /></div><div className="account-copy"><span>Reader account</span><strong>Save your next favorite</strong><p>Build a shelf that follows you everywhere.</p></div><div className="account-actions"><button type="button" className="primary-button" onClick={() => openAuth("signup")}><UserRound size={16} /> Create account</button><button type="button" className="account-quiet-button" onClick={() => openAuth("login")}><LogIn size={16} /> Log in</button></div></>}
      </div>
      {readerSession ? <ReaderProfile key={readerSession.user.id} session={readerSession} books={books} refreshKey={profileRevision} onReview={setReviewBookId} /> : null}
      <div className="profile-links">
        <button type="button" onClick={() => openEmbeddedPage("About The BLK Shelf", "/mirror/about.html")}><span><strong>About The BLK Shelf</strong><small>Our mission and founding team</small></span><ChevronRight size={18} /></button>
        <button type="button" onClick={() => openEmbeddedPage("Reader & author help", "/mirror/faq.html")}><span><strong>Reader & author help</strong><small>Questions, submissions, and guidelines</small></span><ChevronRight size={18} /></button>
        <button type="button" onClick={() => openEmbeddedPage("Submit an author profile", "/mirror/submit-author.html")}><span><strong>Submit an author profile</strong><small>Join the shelf as a Black indie author</small></span><ChevronRight size={18} /></button>
        <button type="button" onClick={() => openEmbeddedPage("Share a bookish event", "/mirror/submit-event.html")}><span><strong>Share a bookish event</strong><small>Signings, festivals, panels, and meetups</small></span><ChevronRight size={18} /></button>
      </div>
      <p className="profile-note">Powered by Black authors. Built for readers, authors, and the culture.</p>
    </section>;
  }

  function closeReviewDialog() {
    document.querySelectorAll<HTMLIFrameElement>(".embedded-site-frame").forEach((frame) => frame.contentWindow?.postMessage({ type: "blk-shelf-reviews-updated", bookId: reviewBookId }, window.location.origin));
    setReviewBookId(null);
    setProfileRevision((value) => value + 1);
  }

  function embeddedScreen(title: string, url: string, returnView?: View, showPromo = false) {
    return <section className="embedded-screen">
      <div className="embedded-screen-bar">
        {returnView ? <button type="button" className="embedded-back" onClick={() => setView(returnView)}><ArrowLeft size={17} /> Back</button> : null}
        <div><p className="eyebrow">Inside The BLK Shelf app</p><h1>{title}</h1></div>
      </div>
      <iframe className="embedded-site-frame" src={url} title={title} sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="strict-origin-when-cross-origin" onLoad={(event) => {
        const document = event.currentTarget.contentDocument;
        if (!document?.documentElement) return;
        const syncPromo = () => {
          const promo = document.querySelector<HTMLElement>(".header-promo-banner");
          if (!promo) return false;
          promo.style.display = showPromo ? "" : "none";
          return true;
        };
        if (!syncPromo()) {
          const observer = new MutationObserver(() => { if (syncPromo()) observer.disconnect(); });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }
      }} />
    </section>;
  }

  const navItems: { id: View; label: string; icon: typeof Home }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "authors", label: "Authors", icon: UsersRound },
    { id: "events", label: "Events", icon: CalendarDays },
    { id: "randomizer", label: "Randomizer", icon: Dices },
    { id: "shelf", label: "My Shelf", icon: LibraryBig },
    { id: "profile", label: "Profile", icon: UserRound },
  ];
  const activeDetail = detail || (selectedBook ? { ...selectedBook, description: "", links: [] } : null);

  return <main className="app-frame">
    <header className="app-header">
      <button type="button" className="brand-button" onClick={() => setView("home")}><img src={LOGO} alt="" /><span><strong>THE BLK SHELF</strong><small>Black stories. Center shelf.</small></span></button>
      <button type="button" className="website-link" onClick={() => openEmbeddedPage("The BLK Shelf", "/mirror/index.html")}>Full site <ChevronRight size={14} /></button>
    </header>
    <div className="app-content">
      {loadError ? <div className="data-notice"><LoaderCircle size={18} /> The live shelf is taking a minute. Try refreshing shortly.</div> : null}
      {view === "home" ? homeScreen() : null}{view === "discover" ? discoverScreen() : null}{view === "search" ? searchScreen() : null}{view === "authors" ? embeddedScreen("Author Directory", "/mirror/author-directory.html", undefined, true) : null}{view === "events" ? embeddedScreen("Events", "/mirror/events.html", undefined, true) : null}{view === "randomizer" ? embeddedScreen("Book Randomizer", "/mirror/randomizer.html") : null}{view === "shelf" ? shelfScreen() : null}{view === "profile" ? profileScreen() : null}{view === "webpage" && embeddedPage ? embeddedScreen(embeddedPage.title, embeddedPage.url, embeddedPage.returnView) : null}
    </div>
    <nav className="bottom-nav" aria-label="App navigation">{navItems.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined} aria-label={item.id === "shelf" && authorReleases.length ? `My Shelf, ${authorReleases.length} upcoming books from favorite authors` : item.label}><Icon size={20} strokeWidth={view === item.id ? 2.5 : 1.8} />{item.id === "shelf" && authorReleases.length ? <b className="shelf-update-badge">{authorReleases.length > 99 ? "99+" : authorReleases.length}</b> : null}<span>{item.label}</span></button>; })}</nav>
    <Sheet open={Boolean(selectedBook)} onOpenChange={(open) => { if (!open) setSelectedBook(null); }}>
      <SheetContent side="right" className="book-sheet">
        {activeDetail ? <div className="sheet-scroll">
          <SheetHeader className="detail-header">
            <div className="detail-cover"><img src={activeDetail.cover} alt={`${activeDetail.title} cover`} onError={(event) => { event.currentTarget.src = DEFAULT_COVER; }} /></div>
            <div className="detail-title-block"><p className="eyebrow">{activeDetail.genre}</p><SheetTitle>{activeDetail.title}</SheetTitle><SheetDescription>by {activeDetail.author}</SheetDescription>{activeDetail.releaseDate ? <p className="release-date">{dateLabel(activeDetail.releaseDate)}</p> : null}</div>
          </SheetHeader>
          <div className="detail-body">
            <button type="button" className={`detail-favorite ${favorites.includes(activeDetail.id) ? "is-saved" : ""}`} aria-pressed={favorites.includes(activeDetail.id)} onClick={() => quickSave(activeDetail)}><Heart size={19} fill={favorites.includes(activeDetail.id) ? "currentColor" : "none"} />{favorites.includes(activeDetail.id) ? "Favorited" : "Add to Favorites"}</button>
            <div className="shelf-control"><label htmlFor="shelf-status">My Shelf</label><ShelfPicker title={activeDetail.title} status={shelf[activeDetail.id]} id="shelf-status" onChange={(value) => updateShelfStatus(activeDetail, value)} /></div>
            {activeDetail.authorId ? <button type="button" className="detail-author-button" onClick={() => { setSelectedBook(null); openEmbeddedPage(activeDetail.author, `/mirror/author.html?id=${encodeURIComponent(activeDetail.authorId)}&source=app`); }}>About the author: {activeDetail.author}</button> : null}
            {activeDetail.authorId ? authorHeart(activeDetail.authorId, activeDetail.author) : null}
            {detailLoading ? <div className="detail-loading"><Skeleton className="detail-line" /><Skeleton className="detail-line" /><Skeleton className="detail-line short" /></div> : <>
              {activeDetail.description ? <section className="detail-section"><h3>About this book</h3><p>{activeDetail.description}</p></section> : null}
              <section className="detail-section"><h3>Vibes & details</h3><div className="detail-tags">{[...activeDetail.vibes, ...activeDetail.subGenres, activeDetail.spice, activeDetail.ageRange, activeDetail.representation].filter(Boolean).map((tag) => <span key={tag}>{tag}</span>)}</div><dl className="detail-facts">{activeDetail.seriesName ? <><dt>Series</dt><dd>{activeDetail.seriesName}</dd></> : null}{activeDetail.formats ? <><dt>Formats</dt><dd>{activeDetail.formats}</dd></> : null}{activeDetail.pageCount ? <><dt>Length</dt><dd>{activeDetail.pageCount} pages</dd></> : null}</dl></section>
              {activeDetail.links.length ? <section className="detail-section"><h3>Where to buy</h3><div className="buy-links">{activeDetail.links.map((link) => <a key={link.label} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={15} /></a>)}</div><p className="affiliate-note">Some retailer links may be affiliate links.</p></section> : null}
            </>}
            <BookReviews key={`${activeDetail.id}-${readerSession?.user.id || "public"}`} bookId={activeDetail.id} session={readerSession} onLogin={() => openAuth("login")} onProfile={() => { setSelectedBook(null); setView("profile"); }} />
          </div>
        </div> : null}
      </SheetContent>
    </Sheet>
    <Dialog open={Boolean(reviewBookId)} onOpenChange={(open) => { if (!open) closeReviewDialog(); }}><DialogContent className="reader-auth-dialog review-dialog"><DialogHeader><DialogTitle>{books.find((book) => book.id === reviewBookId)?.title || "Book ratings & reviews"}</DialogTitle><DialogDescription>Ratings and reviews from readers of The BLK Shelf.</DialogDescription></DialogHeader>{reviewBookId ? <BookReviews key={`${reviewBookId}-${readerSession?.user.id || "public"}`} bookId={reviewBookId} session={readerSession} onLogin={() => openAuth("login")} onProfile={() => { closeReviewDialog(); setView("profile"); }} /> : null}</DialogContent></Dialog>
    <Dialog open={Boolean(manageBookId)} onOpenChange={(open) => { if (!open) setManageBookId(null); }}><DialogContent className="reader-auth-dialog shelf-manager-dialog"><DialogHeader><DialogTitle>{books.find((book) => book.id === manageBookId)?.title || "Save this book"}</DialogTitle><DialogDescription>Keep Favorites and your reading progress together.</DialogDescription></DialogHeader>{manageBookId ? <div className="social-open-actions"><button type="button" className={`detail-favorite ${favorites.includes(manageBookId) ? "is-saved" : ""}`} aria-pressed={favorites.includes(manageBookId)} onClick={() => { const bookId = manageBookId; setManageBookId(null); void persistShelfAction({ bookId, favorite: !favorites.includes(bookId) }); }}><Heart size={19} fill={favorites.includes(manageBookId) ? "currentColor" : "none"} />{favorites.includes(manageBookId) ? "Remove from Favorites" : "Add to Favorites"}</button><div className="shelf-manager-selection"><label htmlFor="manage-shelf-status">Reading status</label><ShelfPicker id="manage-shelf-status" title={books.find((book) => book.id === manageBookId)?.title || "this book"} status={shelf[manageBookId]} onChange={(value) => { const bookId = manageBookId; setManageBookId(null); void persistShelfAction({ bookId, status: value === "remove" ? null : value as ShelfStatus }); }} /></div></div> : null}</DialogContent></Dialog>
    <Dialog open={Boolean(socialLink)} onOpenChange={(open) => { if (!open) setSocialLink(null); }}><DialogContent className="reader-auth-dialog"><DialogHeader><DialogTitle>Open {socialLink?.label}</DialogTitle><DialogDescription>Your phone may open the installed app. If it doesn’t, this link opens the same profile in your browser.</DialogDescription></DialogHeader>{socialLink ? <div className="social-open-actions"><a className="primary-button" href={socialLink.url} target="_blank" rel="noopener noreferrer">Open {socialLink.label} (app or browser)</a><button type="button" className="account-quiet-button" onClick={() => { void navigator.clipboard.writeText(socialLink.url).then(() => toast.success("Profile link copied"), () => toast.error("Couldn't copy the link. Please open it instead.")); }}>Copy profile link</button></div> : null}</DialogContent></Dialog>
    <Dialog open={authDialogOpen} onOpenChange={(open) => { setAuthDialogOpen(open); if (!open) setPendingShelfAction(null); }}>
      <DialogContent className="reader-auth-dialog">
        <DialogHeader>
          <div className="auth-mark"><LockKeyhole size={22} /></div>
          <DialogTitle>{authMode === "signup" ? "Create your reader account" : "Welcome back"}</DialogTitle>
          <DialogDescription>{authMode === "signup" ? "Save books, build your Favorites, and keep your shelf on every device." : "Log in to pick up right where you left off."}</DialogDescription>
        </DialogHeader>
        <div className="auth-mode-switch" role="group" aria-label="Account action">
          <button type="button" disabled={authBusy || resendBusy} className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthNotice(""); }}>Create account</button>
          <button type="button" disabled={authBusy || resendBusy} className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); setAuthNotice(""); }}>Log in</button>
        </div>
        <form className="auth-form" onSubmit={submitAuth}>
          {authMode === "signup" ? <label><span>Name</span><input value={authName} onChange={(event) => setAuthName(event.target.value)} autoComplete="name" placeholder="Your name" /></label> : null}
          <label><span>Email</span><input type="email" disabled={resendBusy || authBusy} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" placeholder="reader@email.com" /></label>
          <label><span>Password</span><input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder="At least 8 characters" /></label>
          {authError ? <p className="auth-message auth-error" role="alert">{authError}</p> : null}
          {authNotice ? <p className="auth-message auth-notice" role="status">{authNotice}</p> : null}
          <button type="submit" className="auth-submit" disabled={authBusy || resendBusy}>{authBusy ? <><LoaderCircle size={17} className="spin" /> One moment…</> : authMode === "signup" ? "Create my account" : "Log in"}</button>
        </form>
        {authMode === "login" ? <div className="auth-resend"><p>Still waiting for your confirmation email? Enter the email you signed up with above.</p><button type="button" className="auth-resend-button" disabled={authBusy || resendBusy || resendSeconds > 0 || !authEmail.trim()} onClick={() => void resendConfirmation()}>{resendBusy ? <><LoaderCircle size={17} className="spin" /> Sending…</> : resendSeconds > 0 ? `Resend confirmation email (${resendSeconds}s)` : "Resend confirmation email"}</button></div> : null}
        <p className="auth-footnote">Browsing stays public. Log in to save books, rate them, or publish a review.</p>
      </DialogContent>
    </Dialog>
    <Toaster position="top-center" />
  </main>;
}

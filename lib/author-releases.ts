type ReleaseBook = { id: string; authorId: string; releaseDate: string };

export function upcomingAuthorBooks<T extends ReleaseBook>(books: T[], authorIds: string[], shelf: Record<string, unknown>, dismissed: string[], now = new Date()): T[] {
  const followed = new Set(authorIds);
  const hidden = new Set(dismissed);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  function releaseTime(value: string) {
    if (!value.trim()) return NaN;
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
    return iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime() : new Date(value).getTime();
  }
  return books.filter((book) => followed.has(book.authorId) && !shelf[book.id] && !hidden.has(book.id) && releaseTime(book.releaseDate) >= today)
    .sort((a, b) => releaseTime(a.releaseDate) - releaseTime(b.releaseDate));
}

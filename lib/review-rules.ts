export const MAX_REVIEW_LENGTH = 5000;
export const MAX_DISPLAY_NAME_LENGTH = 40;

export function sentenceCount(value: string) {
  // Protect common abbreviations and decimal points from being counted as sentences.
  const text = value.trim()
    .replace(/\.{2,}/g, "…")
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|St|vs|etc)\./gi, (match) => match.replaceAll(".", "·"))
    .replace(/\b(?:e\.g\.|i\.e\.)/gi, (match) => match.replaceAll(".", "·"))
    .replace(/(\d)\.(?=\d)/g, "$1·")
    .replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g, "$1·");
  return (text.match(/[^.!?]+[.!?]+/gu) || []).filter((sentence) => /[\p{L}\p{N}]/u.test(sentence)).length;
}

export function reviewError(rating: unknown, review: unknown) {
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return "Choose a rating from 1 to 5 stars.";
  if (typeof review !== "string") return "Enter your review as text.";
  if (review.length > MAX_REVIEW_LENGTH) return `Keep your review under ${MAX_REVIEW_LENGTH.toLocaleString()} characters.`;
  if (rating <= 3 && sentenceCount(review) < 2) return "Ratings of 3 stars or lower need at least two complete sentences explaining your rating. End each sentence with a period, question mark, or exclamation point.";
  return "";
}

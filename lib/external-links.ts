export function externalUrl(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw || /^(?:n\/?a|none|null|undefined|#)$/i.test(raw)) return "";
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/\//, "")}`);
    return /\./.test(url.hostname) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

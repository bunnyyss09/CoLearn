/**
 * Session notes: HTML from TipTap is stored. Helpers for plain-text views and old plain notes.
 */
export function looksLikeHtml(s: string): boolean {
  return /^\s*<[!/?a-zA-Z]/.test(s || "");
}

export function toEditorHtml(raw: string | undefined | null): string {
  if (raw == null || !String(raw).length) return "<p></p>";
  const s = String(raw);
  if (looksLikeHtml(s)) return s;
  const esc = (t: string) =>
    t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return s.split(/\n/).map((line) => `<p>${line.length ? esc(line) : "<br />"}</p>`).join("");
}

/** Plain text for list previews: first line, stripped of tags and short. */
export function firstLineFromNoteHtml(content: string, max = 52): string {
  const plain = stripSessionNoteToPlain(content);
  if (!plain) return "Untitled";
  const line = plain.split(/\n/)[0] ?? "";
  if (!line.trim()) return "Untitled";
  return line.length > max ? `${line.slice(0, max).trim()}…` : line;
}

export function stripSessionNoteToPlain(content: string): string {
  let t = (content || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n")
    .replace(/<\/(div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, " ")
    .replace(/ +/g, " ");
  return t;
}

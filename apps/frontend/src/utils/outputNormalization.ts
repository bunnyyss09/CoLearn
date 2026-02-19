export function normalizeForComparison(raw: string | null | undefined): string {
  if (raw == null) return "";

  let normalized = String(raw);

  // Normalize line endings
  normalized = normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Convert one layer of escaped newline
  normalized = normalized.replace(/\\n/g, "\n");

  // Remove trailing spaces per line (keep leading)
  normalized = normalized
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  // Ignore trailing newline differences
  normalized = normalized.replace(/\n+$/, "");

  return normalized;
}

export function normalizeForDisplay(raw: string | null | undefined): string {
  if (raw == null) return "";

  let normalized = String(raw);

  normalized = normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  normalized = normalized.replace(/\\n/g, "\n");

  return normalized;
}

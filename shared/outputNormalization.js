// Shared helpers for normalizing program output.
// Plain JavaScript so it can be required from both Node (Express)
// and the Vite React frontend without extra build configuration.

/**
 * Normalize an output string for comparison between expected and actual.
 *
 * Rules:
 * - Convert all line endings to "\n"
 * - Remove trailing spaces/tabs on each line (keep leading spaces)
 * - Ignore a single final trailing newline difference
 */
function normalizeForComparison(raw) {
  if (raw == null) return "";

  let normalized = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  normalized = normalized
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  if (normalized.endsWith("\n")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Normalize an output string for display:
 *
 * - Convert CRLF/CR to "\n"
 * - Convert a single layer of literal "\n" sequences into real newlines
 * - Preserve all other whitespace (no trimming)
 */
function normalizeForDisplay(raw) {
  if (raw == null) return "";

  let normalized = String(raw);

  normalized = normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  normalized = normalized.replace(/\\n/g, "\n");

  return normalized;
}

module.exports = {
  normalizeForComparison,
  normalizeForDisplay,
};


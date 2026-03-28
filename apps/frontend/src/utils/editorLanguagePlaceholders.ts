const PLACEHOLDER_TEXT = "Write your code here...";

/** First line is only the default starter (// or # style). */
const PLACEHOLDER_FIRST_LINE = /^(\/\/|#)\s*Write your code here\.\.\.\s*$/;

/**
 * Opening comment line for the editor, matching each language's line-comment syntax.
 */
export function getStarterLineForLanguage(lang: string): string {
  switch (lang.toLowerCase()) {
    case "python":
      return `# ${PLACEHOLDER_TEXT}`;
    case "javascript":
    case "cpp":
    case "java":
    case "rust":
    case "go":
      return `// ${PLACEHOLDER_TEXT}`;
    default:
      return `// ${PLACEHOLDER_TEXT}`;
  }
}

/**
 * When the room language changes, rewrite the top placeholder line to valid syntax
 * for `newLang`. Other lines and custom first lines are left unchanged.
 */
export function adaptStarterCommentToLanguage(code: string, newLang: string): string {
  if (!code.trim()) {
    return getStarterLineForLanguage(newLang);
  }
  const lines = code.split("\n");
  const firstRaw = lines[0] ?? "";
  const firstTrimmed = firstRaw.trim();
  if (PLACEHOLDER_FIRST_LINE.test(firstTrimmed)) {
    lines[0] = getStarterLineForLanguage(newLang);
    return lines.join("\n");
  }
  return code;
}

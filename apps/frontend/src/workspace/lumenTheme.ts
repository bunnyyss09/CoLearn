/** Lumen workspace — shared chrome for CodeEditor + LearningRoom */

export function lumenWorkspace(isDark: boolean) {
  const D = isDark;
  return {
    page: D ? "lumen-grid-dk text-zinc-300" : "lumen-grid-lt text-zinc-900",
    header: D ? "border-lumen-line bg-lumen-ink/98" : "border-lumen-line bg-lumen-canvas/98",
    bar: D ? "border-lumen-line bg-lumen-panel" : "border-lumen-line bg-white",
    rail: D ? "border-lumen-line bg-lumen-panel" : "border-lumen-line bg-lumen-canvas",
    editorFrame: D ? "border-lumen-line bg-lumen-void" : "border-lumen-line bg-white",
    inset: D ? "bg-lumen-ink border-lumen-line" : "bg-white border-lumen-line",
    muted: D ? "text-zinc-500" : "text-zinc-600",
    hi: D ? "text-zinc-100" : "text-zinc-900",
    input: D
      ? "border-lumen-line bg-lumen-void text-zinc-200 placeholder-zinc-600 focus:border-lumen-signal/50 focus:ring-1 focus:ring-lumen-signal/30"
      : "border-lumen-line bg-white text-zinc-900 placeholder-zinc-400 focus:border-rose-500/40 focus:ring-1 focus:ring-rose-500/20",
    console: "bg-[#020203] font-mono text-lumen-ok",
    tabActive: D ? "border-cyan-400 text-cyan-400 shadow-signal" : "border-rose-600 text-rose-700",
    tabIdle: D
      ? "border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
      : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
    run: D
      ? "bg-lumen-heat hover:bg-lumen-heatGlow text-white shadow-lg shadow-rose-500/20"
      : "bg-lumen-heat hover:bg-rose-600 text-white shadow-lg shadow-rose-500/25",
    pill: D ? "border-lumen-line bg-lumen-lift text-cyan-400" : "border-lumen-line bg-zinc-100 text-rose-700",
    divide: D ? "divide-lumen-line" : "divide-lumen-line",
    briefing: D ? "border-lumen-line bg-lumen-panel" : "border-lumen-line bg-white",
  };
}

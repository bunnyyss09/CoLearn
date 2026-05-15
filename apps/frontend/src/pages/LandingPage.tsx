import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  FiArrowRight,
  FiBookOpen,
  FiCheckCircle,
  FiCode,
  FiCpu,
  FiLayers,
  FiMessageCircle,
  FiPlay,
  FiRadio,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import AnimatedBackground from "../components/AnimatedBackground";

const chapterCards = [
  {
    index: "01",
    title: "The Room",
    label: "Collaborate live",
    body: "Spin up a shared coding room where teammates, mentors, and classmates can write, test, and reason together in real time.",
    icon: FiUsers,
    accent: "#00f0ff",
  },
  {
    index: "02",
    title: "The Trace",
    label: "Visualize execution",
    body: "Turn abstract code into a visible path: inputs, outputs, edge cases, and mental models stay in the same learning cockpit.",
    icon: FiLayers,
    accent: "#30d158",
  },
  {
    index: "03",
    title: "The Guide",
    label: "AI coaching",
    body: "Ask for hints, reviews, explanations, and debugging help without leaving the workspace or losing your train of thought.",
    icon: FiCpu,
    accent: "#bf5af2",
  },
  {
    index: "04",
    title: "The Proof",
    label: "Practice that sticks",
    body: "Checkpoint-based modules build from beginner confidence to interview readiness with tests, notes, and reflections.",
    icon: FiCheckCircle,
    accent: "#ff9f0a",
  },
];

const learningPath = [
  "Absolute beginner",
  "Code walkthrough",
  "Data structures",
  "Interview-ready builder",
];

const proofCards = [
  { value: "Live", label: "rooms with chat, voice, code, and AI in one place" },
  { value: "AI", label: "Socratic hints, code reviews, and session summaries" },
  { value: "8+", label: "languages ready for collaborative execution" },
  { value: "Zero", label: "context switching between learning and building" },
];

const codeLines = [
  "function learnTogether(room) {",
  "  const idea = explain(code);",
  "  const trace = visualize(idea);",
  "  return team.master(trace);",
  "}",
];

const LandingPage = () => {
  const isDark = true;
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.35], [0, -120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0.45]);

  useEffect(() => {
    document.title = "CoLearn - Learn Coding Together";
    setIsAuthenticated(Boolean(localStorage.getItem("authToken")));
  }, []);

  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        left: `${(index * 17) % 100}%`,
        delay: `${(index % 9) * 0.45}s`,
        duration: `${7 + (index % 6)}s`,
        size: `${3 + (index % 4)}px`,
      })),
    []
  );

  const primaryHref = isAuthenticated ? "/dashboard" : "/start";

  return (
    <main className="min-h-screen overflow-hidden font-sans app-shell-dark text-white">
      <AnimatedBackground isDark={isDark} />
      <div className="pointer-events-none fixed inset-0 z-0 grid-atmosphere opacity-70" />
      <div className="pointer-events-none fixed inset-0 z-0 noise-overlay opacity-[0.03]" />
      {particles.map((particle, index) => (
        <span
          key={index}
          className="pointer-events-none fixed bottom-[-5vh] z-0 rounded-full bg-[#00f0ff] opacity-50 animate-particle"
          style={{
            left: particle.left,
            width: particle.size,
            height: particle.size,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
          }}
        />
      ))}

      <header className="fixed inset-x-0 top-0 z-40 px-4 py-4 sm:px-6">
        <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-surface-950/45 px-4 py-3 shadow-glass backdrop-blur-2xl">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(0,240,255,0.28)] bg-[rgba(0,240,255,0.08)] text-[#00f0ff] shadow-glow-neon">
              <FiCode size={18} />
            </span>
            <span className="font-display text-lg font-bold tracking-wide text-white">CoLearn</span>
          </Link>
          <div className="hidden items-center gap-6 text-xs font-semibold uppercase tracking-[0.2em] text-gray-400 md:flex">
            <a href="#chapters" className="transition hover:text-[#00f0ff]">Process</a>
            <a href="#visualize" className="transition hover:text-[#00f0ff]">Visualize</a>
            <a href="#path" className="transition hover:text-[#00f0ff]">Path</a>
          </div>
          <Link
            to={primaryHref}
            className="future-btn rounded-xl px-4 py-2 text-sm font-semibold text-white"
          >
            <span className="relative z-10 flex items-center gap-2">
              {isAuthenticated ? "Dashboard" : "Start"}
              <FiArrowRight size={16} />
            </span>
          </Link>
        </nav>
      </header>

      <section className="relative z-10 flex min-h-screen items-center px-4 pb-16 pt-28 sm:px-6 lg:pt-24">
        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mb-6 inline-flex items-center gap-3 rounded-full border border-[rgba(0,240,255,0.18)] bg-[rgba(0,240,255,0.06)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#00f0ff] backdrop-blur-xl"
            >
              <span className="h-2 w-2 rounded-full bg-[#30d158] shadow-[0_0_18px_rgba(48,209,88,0.8)]" />
              A cinematic coding classroom
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 28, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.08, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-5xl font-display text-6xl font-black leading-[0.92] tracking-tight text-white sm:text-7xl lg:text-8xl"
            >
              Learn code like you can see it running.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-2xl text-lg leading-8 text-gray-300 sm:text-xl"
            >
              CoLearn fuses visual programming education, real-time rooms, AI guidance, voice, notes, tests, and collaborative code into one futuristic learning studio.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Link to={primaryHref} className="future-btn rounded-2xl px-6 py-4 text-center font-bold text-white shadow-glow-neon">
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Enter CoLearn
                  <FiArrowRight />
                </span>
              </Link>
              <a href="#visualize" className="rounded-2xl border border-white/12 bg-white/[0.04] px-6 py-4 text-center font-bold text-white backdrop-blur-xl transition hover:border-[rgba(0,240,255,0.28)] hover:bg-white/[0.07]">
                <span className="flex items-center justify-center gap-2">
                  <FiPlay /> Watch the idea
                </span>
              </a>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94, rotateX: 12 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ delay: 0.24, duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
            className="relative min-h-[520px] perspective-1000"
          >
            <div className="absolute inset-x-6 top-0 h-72 rounded-full bg-gradient-aurora opacity-20 blur-3xl animate-aurora" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-surface-950/70 p-4 shadow-elevated-dark backdrop-blur-2xl">
              <div className="absolute inset-0 bg-gradient-mesh opacity-80" />
              <div className="relative rounded-[1.5rem] border border-white/10 bg-black/40 p-4">
                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#00f0ff]">Live execution film</p>
                    <h2 className="mt-2 font-display text-2xl font-bold text-white">Pointers / loops / memory</h2>
                  </div>
                  <span className="rounded-full border border-[#30d158]/30 bg-[#30d158]/10 px-3 py-1 font-mono text-xs text-[#30d158]">SYNC 097%</span>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_0.86fr]">
                  <div className="rounded-2xl border border-white/10 bg-surface-900/70 p-4 font-mono text-sm text-gray-300">
                    {codeLines.map((line, index) => (
                      <motion.div
                        key={line}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.55 + index * 0.12, duration: 0.45 }}
                        className="flex gap-4 py-1"
                      >
                        <span className="w-5 text-right text-gray-600">{index + 1}</span>
                        <span className={index === 2 ? "text-[#00f0ff]" : ""}>{line}</span>
                      </motion.div>
                    ))}
                  </div>
                  <div className="grid gap-3">
                    {["input", "stack", "heap", "output"].map((node, index) => (
                      <motion.div
                        key={node}
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 + index * 0.1, duration: 0.5 }}
                        className="rounded-2xl border border-[rgba(0,240,255,0.12)] bg-[rgba(0,240,255,0.04)] p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs uppercase tracking-[0.22em] text-gray-400">{node}</span>
                          <span className="h-2 w-2 rounded-full bg-[#00f0ff] shadow-[0_0_16px_rgba(0,240,255,0.8)]" />
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${42 + index * 16}%` }}
                            transition={{ delay: 0.9 + index * 0.12, duration: 0.8, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-to-r from-[#00f0ff] to-[#bf5af2]"
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    ["Peers", "04"],
                    ["Hints", "12"],
                    ["Tests", "pass"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
                      <p className="font-display text-xl font-bold text-white">{value}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <div className="relative z-10 border-y border-white/10 bg-surface-950/50 py-3 backdrop-blur-xl">
        <div className="flex w-max animate-[shimmer_22s_linear_infinite] gap-8 whitespace-nowrap font-mono text-sm uppercase tracking-[0.28em] text-gray-400">
          {Array.from({ length: 3 }).map((_, group) => (
            <span key={group} className="flex gap-8">
              <span>visual learning</span><span className="text-[#00f0ff]">/</span><span>AI tutor</span><span className="text-[#bf5af2]">/</span><span>live code rooms</span><span className="text-[#30d158]">/</span><span>voice collaboration</span><span className="text-[#ff9f0a]">/</span>
            </span>
          ))}
        </div>
      </div>

      <section id="chapters" className="relative z-10 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#00f0ff]">A film in four chapters</p>
              <h2 className="mt-3 max-w-3xl font-display text-4xl font-black tracking-tight text-white md:text-6xl">From confused to cracked, without leaving the room.</h2>
            </div>
            <p className="max-w-md text-gray-400">A learning platform should feel like a studio, a debugger, a whiteboard, and a teammate. CoLearn makes those pieces move together.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {chapterCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.article
                  key={card.title}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: index * 0.08, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                  className="group holo-border min-h-[330px] rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl transition hover:-translate-y-2 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-gray-500">{card.index}</span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-white/[0.04]" style={{ borderColor: `${card.accent}44`, color: card.accent }}>
                      <Icon size={20} />
                    </span>
                  </div>
                  <p className="mt-12 font-mono text-xs uppercase tracking-[0.24em]" style={{ color: card.accent }}>{card.label}</p>
                  <h3 className="mt-4 font-display text-3xl font-bold text-white">{card.title}</h3>
                  <p className="mt-4 leading-7 text-gray-400">{card.body}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="visualize" className="relative z-10 px-4 py-24 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="glass-panel rounded-3xl p-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#30d158]">Why learners choose it</p>
            <h2 className="mt-4 font-display text-4xl font-black text-white md:text-5xl">Step-by-step code intuition, but collaborative.</h2>
            <p className="mt-5 leading-8 text-gray-400">Inspired by visual learning, built for teams: your editor, AI tutor, notes, chat, voice, module checkpoints, and test output all stay connected.</p>
            <div className="mt-8 grid gap-3">
              {[
                [FiRadio, "Live signal", "Everyone sees the same room state."],
                [FiMessageCircle, "Explain and reflect", "Turn answers into durable understanding."],
                [FiZap, "Fast feedback", "Run code, review output, ask AI, repeat."],
              ].map(([Icon, title, body]) => {
                const TypedIcon = Icon as typeof FiRadio;
                return (
                  <div key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex gap-3">
                      <TypedIcon className="mt-1 shrink-0 text-[#00f0ff]" size={20} />
                      <div>
                        <p className="font-semibold text-white">{title as string}</p>
                        <p className="mt-1 text-sm text-gray-400">{body as string}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-surface-950/60 p-6 shadow-elevated-dark backdrop-blur-2xl">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#bf5af2]/20 blur-3xl" />
            <div className="relative grid gap-4 md:grid-cols-2">
              {proofCards.map((item, index) => (
                <motion.div
                  key={item.value}
                  initial={{ opacity: 0, scale: 0.94 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.07, duration: 0.55 }}
                  className="min-h-[190px] rounded-3xl border border-white/10 bg-white/[0.04] p-6"
                >
                  <p className="font-display text-5xl font-black gradient-text-neon">{item.value}</p>
                  <p className="mt-5 max-w-xs leading-7 text-gray-400">{item.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="path" className="relative z-10 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl md:p-10">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ff9f0a]">Learning path</p>
              <h2 className="mt-4 font-display text-4xl font-black text-white md:text-5xl">Absolute beginner to algorithmic programmer.</h2>
              <p className="mt-5 leading-8 text-gray-400">Create a room, pick a module, solve checkpoints, talk through ideas, and leave with notes that remember the whole session.</p>
            </div>
            <div className="relative">
              <div className="absolute left-6 top-6 hidden h-[calc(100%-3rem)] w-px bg-gradient-to-b from-[#00f0ff] via-[#bf5af2] to-[#30d158] md:block" />
              <div className="grid gap-4">
                {learningPath.map((step, index) => (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 24 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.08, duration: 0.55 }}
                    className="relative flex items-center gap-4 rounded-2xl border border-white/10 bg-surface-950/60 p-4"
                  >
                    <span className="z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[rgba(0,240,255,0.24)] bg-[rgba(0,240,255,0.08)] font-mono text-sm text-[#00f0ff]">0{index + 1}</span>
                    <div>
                      <h3 className="font-display text-xl font-bold text-white">{step}</h3>
                      <p className="mt-1 text-sm text-gray-500">Learn by seeing, building, discussing, and proving.</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-[rgba(0,240,255,0.18)] bg-gradient-to-r from-[rgba(0,240,255,0.12)] via-[rgba(191,90,242,0.12)] to-[rgba(48,209,88,0.1)] p-8 text-center backdrop-blur-2xl md:p-12">
          <FiBookOpen className="mx-auto text-[#00f0ff]" size={34} />
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-black text-white md:text-6xl">Open the studio. Start the room. Make the code visible.</h2>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate(primaryHref)}
              className="future-btn rounded-2xl px-7 py-4 font-bold text-white shadow-glow-neon"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isAuthenticated ? "Go to dashboard" : "Start learning"}
                <FiArrowRight />
              </span>
            </button>
            <Link to="/start" className="rounded-2xl border border-white/12 bg-white/[0.05] px-7 py-4 font-bold text-white backdrop-blur-xl transition hover:border-white/24 hover:bg-white/[0.08]">
              Join a room
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LandingPage;
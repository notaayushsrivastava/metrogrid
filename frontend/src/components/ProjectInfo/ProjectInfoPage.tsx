import { ArrowLeft, ArrowUpRight, Box, Code, Crown, ExternalLink, Globe, Layers, Mic, Moon, Network, Palette, ShieldCheck, Sparkles, Sun, Terminal, Users, Zap } from "lucide-react";
import type { Theme } from "../../hooks/useTheme";

/* ------------------------------------------------------------------ */
/* Team BUG OFF — Code2Create 7.0 (ACM-VIT) roster. Avatars stream     */
/* live from GitHub: https://github.com/<handle>.png (size=160).      */
/* ------------------------------------------------------------------ */
interface TeamMember {
  name: string;
  handle: string;
  roles: string[];
  leader?: boolean;
  initials: string;
}

const TEAM_NAME = "BUG OFF";

const TEAM: TeamMember[] = [
  {
    name: "Aayush Srivastava",
    handle: "notaayushsrivastava",
    roles: ["Presenter", "QNA", "Technical Presenter", "Lead Developer", "Pitcher"],
    leader: true,
    initials: "AS",
  },
  {
    name: "Raphael Terrance Fernandez",
    handle: "RaphaelTerrance",
    roles: ["Technical Presenter", "Pitcher"],
    initials: "RF",
  },
  {
    name: "Pradyun Shetty",
    handle: "anonymouse336",
    roles: ["Presenter", "Prompt Engineer"],
    initials: "PS",
  },
  {
    name: "Kartikey Gupta",
    handle: "Kartikey984",
    roles: ["Presenter", "Pitcher"],
    initials: "KG",
  },
  {
    name: "Neelaksh Gupta",
    handle: "itsNeelaksh",
    roles: ["Presenter", "Prompt Engineer"],
    initials: "NG",
  },
];

function TeamAvatar({ member, sizeClass }: { member: TeamMember; sizeClass: string }) {
  return (
    <div className={`relative ${sizeClass} overflow-hidden rounded-2xl border-2 border-[#38bdf8]/50 bg-gradient-to-tr from-[#ff75a0]/30 to-[#38bdf8]/30 shadow-lg shadow-[#38bdf8]/10 shrink-0`}>
      {/* Fallback initials sit BEHIND the photo so they never push it out of frame */}
      <span aria-hidden className="absolute inset-0 flex items-center justify-center text-2xl font-mono font-bold text-white select-none">
        {member.initials}
      </span>
      <img
        src={`https://github.com/${member.handle}.png?size=160`}
        alt={`${member.name} (@${member.handle}) GitHub profile picture`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-cover"
        onError={(e) => {
          // Keep initials fallback visible if the avatar cannot load
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

interface ProjectInfoPageProps {
  theme?: Theme;
  toggleTheme?: () => void;
  onClose?: () => void;
}

export function ProjectInfoPage({ theme, toggleTheme, onClose }: ProjectInfoPageProps) {
  return (
    <div className="min-h-screen bg-[#0c0004] text-[#f8fafc] font-sans selection:bg-[#ff75a0]/30 selection:text-white relative overflow-x-hidden">
      {/* Dynamic Background Blueprint + Sakura Glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(56, 189, 248, 0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
      />
      <div
        className="fixed top-0 left-1/4 w-[600px] h-[500px] bg-[#ff75a0]/15 rounded-full blur-[140px] pointer-events-none z-0"
      />
      <div
        className="fixed bottom-0 right-1/4 w-[700px] h-[500px] bg-[#38bdf8]/10 rounded-full blur-[160px] pointer-events-none z-0"
      />

      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#ff75a0]/20 bg-[#0c0004]/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-[#ff75a0]/30 bg-[#1a0510]/80 px-2.5 py-1.5 text-xs font-semibold text-[#ff75a0] hover:bg-[#ff75a0]/20 transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <a
              href="/"
              className="flex items-center gap-1.5 rounded-lg border border-[#ff75a0]/30 bg-[#1a0510]/80 px-2.5 py-1.5 text-xs font-semibold text-[#ff75a0] hover:bg-[#ff75a0]/20 transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Home</span>
            </a>
          )}
          <div className="h-4 w-[1px] bg-[#ff75a0]/20" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold tracking-widest text-[#ff75a0] uppercase">
              METROGRID // PROJECT INFO
            </span>
            <span className="rounded-full bg-[#ff75a0]/20 border border-[#ff75a0]/40 px-2 py-0.5 text-[10px] font-mono text-[#fda4af]">
              CODE2CREATE EDITION
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {toggleTheme && (
            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-[#ff75a0]/20 bg-[#1a0510] text-[#ff75a0] hover:bg-[#ff75a0]/20 transition-colors text-xs"
              aria-label="Toggle theme"
            >
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
          )}

          <a
            href="https://github.com/notaayushsrivastava/metrogrid"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-[#ff75a0]/30 bg-[#1a0510] px-3 py-1.5 text-xs font-semibold text-[#fda4af] hover:border-[#ff75a0] hover:bg-[#ff75a0]/15 transition-all shadow-sm"
          >
            <svg className="size-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>GitHub</span>
          </a>

          <a
            href="/planner?t=1"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#ff75a0] to-[#f472b6] px-3.5 py-1.5 text-xs font-bold text-black hover:opacity-90 transition-opacity shadow-md shadow-[#ff75a0]/20"
          >
            <span>Launch Planner</span>
            <ArrowUpRight className="size-3.5 stroke-[2.5]" />
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 py-10 space-y-16">
        
        {/* Code2Create Hero Showcase Banner */}
        <section className="rounded-3xl border border-[#ff75a0]/40 bg-gradient-to-b from-[#1a0510]/90 to-[#0c0004]/95 p-6 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
          {/* Subtle Sakura Blossom Petals in corner */}
          <div className="absolute top-0 right-0 p-8 pointer-events-none opacity-20 group-hover:opacity-30 transition-opacity">
            <svg width="160" height="160" viewBox="0 0 100 100" fill="none">
              <path d="M50 0 C60 25 75 35 100 50 C75 65 60 75 50 100 C40 75 25 65 0 50 C25 35 40 25 50 0 Z" fill="#ff75a0" />
            </svg>
          </div>

          <div className="space-y-6 max-w-3xl">
            {/* C2C Kicker Badge — official Code2Create 7.0 tokens */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff75a0]/50 bg-[#ff75a0]/15 px-3 py-1 text-xs font-mono text-[#fda4af]">
              <Sparkles className="size-3.5 text-[#ff75a0]" />
              <span>CODE2CREATE 7.0 // ACM-VIT · 6 - 8 SEPT 2026 · VIT VELLORE</span>
            </div>

            {/* Official Code2Create wordmark — white rounded type, pink sakura 'o', trailing petal */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs uppercase font-mono tracking-widest text-[#ff75a0]/80">Developed in</span>
              </div>
              <a href="https://c2c.acmvit.in" target="_blank" rel="noopener noreferrer" aria-label="Code2Create 7.0 by ACM-VIT — official site" className="inline-block rounded-xl transition-transform duration-300 hover:scale-[1.015] focus-visible:outline-2 focus-visible:outline-[#ff75a0]">
                <span role="img" aria-label="Code2Create logo" className="flex items-center leading-none font-extrabold tracking-tight text-white text-5xl sm:text-7xl" style={{ fontFamily: "'Baloo 2','Bricolage Grotesque','Instrument Sans',ui-rounded,system-ui,sans-serif" }}>
                  <span>C</span>
                  {/* sakura 'o' — five soft pink petals around a dark heart */}
                  <svg viewBox="0 0 100 100" aria-hidden className="h-[0.82em] w-auto mx-[0.02em] shrink-0 drop-shadow-[0_0_10px_rgba(241,145,179,0.65)] transition-transform duration-500 hover:rotate-45">
                    <g fill="#f191b3">
                      <ellipse cx={50} cy={26} rx={15.5} ry={20} />
                      <ellipse cx={50} cy={26} rx={15.5} ry={20} transform="rotate(72 50 50)" />
                      <ellipse cx={50} cy={26} rx={15.5} ry={20} transform="rotate(144 50 50)" />
                      <ellipse cx={50} cy={26} rx={15.5} ry={20} transform="rotate(216 50 50)" />
                      <ellipse cx={50} cy={26} rx={15.5} ry={20} transform="rotate(288 50 50)" />
                    </g>
                    <circle cx={50} cy={50} r={8} fill="#0c0004" />
                  </svg>
                  <span>de2Creat</span>
                  <span className="relative inline-block">
                    e
                    {/* trailing curled sakura petal fused to the final 'e' */}
                    <svg viewBox="0 0 80 112" aria-hidden className="absolute left-[0.42em] bottom-[0.02em] h-[1.05em] w-auto overflow-visible">
                      <path d="M8 6 C 36 4, 56 20, 53 50 C 50 76, 32 94, 10 98 C 24 84, 32 66, 30 47 C 28 28, 20 12, 8 6 Z" fill="#e78aa8" />
                      <path d="M14 12 C 32 15, 44 28, 42 50" fill="none" stroke="#f7c3d4" strokeWidth={4.5} strokeLinecap="round" opacity={0.9} />
                      <path d="M10 98 C 28 86, 42 64, 46 40" fill="none" stroke="#b44f76" strokeWidth={3.5} strokeLinecap="round" opacity={0.85} />
                    </svg>
                  </span>
                </span>
              </a>
              <p className="text-lg sm:text-xl font-medium text-[#fda4af] italic">
                &ldquo;Don&apos;t just code for the vibes. Code2Create.&rdquo;
              </p>
            </div>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              MetroGrid was architected and built during <strong className="text-white font-semibold">Code2Create 7.0</strong>, a flagship 48-hour national hackathon hosted by <strong className="text-[#ff75a0]">ACM-VIT</strong> at VIT Vellore.
            </p>
          </div>
        </section>

        {/* Team BUG OFF — Code2Create night-sakura themed roster */}
        <section className="rounded-3xl border border-[#38bdf8]/30 bg-gradient-to-br from-[#0c0004] via-[#10192e] to-[#0c0004] p-6 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="flex items-center justify-between pb-6 border-b border-[#38bdf8]/20 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-[#38bdf8] uppercase">
                <Terminal className="size-4" />
                <span>Project Architect & Team</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
                Meet Team {TEAM_NAME}
              </h2>
              <p className="text-xs font-mono text-[#fda4af] mt-1.5 tracking-wide">
                CODE2CREATE 7.0 // ACM-VIT · 48-HOUR NATIONAL HACKATHON · VIT VELLORE
              </p>
            </div>
            {/* Team badge */}
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#ff75a0] bg-gradient-to-r from-[#ff75a0]/20 via-[#38bdf8]/20 to-[#ff75a0]/20 px-4 py-1.5 shadow-[0_0_15px_rgba(255,117,160,0.3)]">
              <Users className="size-4 text-[#ff75a0]" />
              <span className="font-mono text-xs font-extrabold tracking-wider text-white uppercase">
                Team {TEAM_NAME}
              </span>
              <ShieldCheck className="size-4 text-[#38bdf8]" />
            </div>
          </div>

          <div className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Leader card — FIXED avatar: fixed-size frame, photo absolutely
                positioned with object-cover so it can never push out of frame;
                initials render behind as the offline fallback. */}
            <div className="md:col-span-1 rounded-2xl border border-[#ff75a0]/30 bg-[#080e1a]/80 p-5 text-center space-y-3 relative overflow-hidden">
              <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#ff75a0] to-[#f472b6] px-2.5 py-0.5 text-[10px] font-mono font-extrabold uppercase tracking-wider text-black shadow-md shadow-[#ff75a0]/30">
                <Crown className="size-3 stroke-[2.5]" /> Team Leader
              </span>
              <div className="pt-4 flex justify-center">
                <TeamAvatar member={TEAM[0]} sizeClass="w-28 h-28" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{TEAM[0].name}</h3>
                <p className="text-xs font-mono text-[#38bdf8]">@{TEAM[0].handle}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {TEAM[0].roles.map((role) => (
                  <span key={role} className="rounded-md border border-[#ff75a0]/30 bg-[#ff75a0]/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-[#fda4af]">
                    {role}
                  </span>
                ))}
              </div>
              <a
                href={`https://github.com/${TEAM[0].handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#38bdf8]/40 bg-[#38bdf8]/10 px-3 py-2 text-xs font-semibold text-white hover:bg-[#38bdf8]/20 transition-colors"
              >
                <svg className="size-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>View GitHub Profile</span>
                <ExternalLink className="size-3 ml-0.5 text-muted-foreground" />
              </a>
            </div>

            {/* Leader Role & Bio */}
            <div className="md:col-span-2 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs font-mono text-black bg-gradient-to-r from-[#ff75a0] to-[#f472b6] border border-[#ff75a0] px-2 py-0.5 rounded font-bold">
                    <Crown className="size-3" /> TEAM LEADER
                  </span>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                    AUTHOR & LEAD DEVELOPER
                  </span>
                  <span className="text-xs font-mono text-[#fda4af] bg-[#1a0510] border border-[#ff75a0]/30 px-2 py-0.5 rounded">
                    CODE2CREATE PARTICIPANT
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  MetroGrid was envisioned, architected, and built from scratch by <strong className="text-white">Aayush Srivastava</strong> (<a href="https://github.com/notaayushsrivastava" target="_blank" rel="noopener noreferrer" className="text-[#38bdf8] hover:underline">@notaayushsrivastava</a>), Team Leader of <strong className="text-[#ff75a0]">BUG OFF</strong>. From the 2D sparse grid engine to multi-tier Dijkstra transport algorithms, procedural 3D Three.js pipelines, and the OpenStreetMap GIS parser — leading the crew through presentation, Q&A, and technical delivery at Code2Create 7.0.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">Role</span>
                  <span className="text-xs font-bold text-white">Team Leader · Full-Stack Simulation Architect</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">GitHub Handle</span>
                  <span className="text-xs font-mono font-bold text-[#38bdf8]">notaayushsrivastava</span>
                </div>
              </div>
            </div>
          </div>

          {/* Crew of BUG OFF — live GitHub avatars, in-frame by construction */}
          <div className="pt-8">
            <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-[#ff75a0] uppercase pb-4">
              <Mic className="size-4" />
              <span>Crew of {TEAM_NAME} — Presenters & Engineers</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {TEAM.slice(1).map((member) => (
                <article key={member.handle} className="rounded-2xl border border-white/10 bg-[#080e1a]/80 p-5 text-center space-y-3 hover:border-[#ff75a0]/40 transition-colors">
                  <div className="flex justify-center">
                    <TeamAvatar member={member} sizeClass="w-20 h-20" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">{member.name}</h3>
                    <a href={`https://github.com/${member.handle}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-[#38bdf8] hover:underline">
                      @{member.handle}
                    </a>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {member.roles.map((role) => (
                      <span key={role} className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-200">
                        {role}
                      </span>
                    ))}
                  </div>
                  <a href={`https://github.com/${member.handle}`} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-[#ff75a0]/50 hover:text-white transition-colors">
                    <Code className="size-3.5" />
                    <span>GitHub</span>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </a>
                </article>
              ))}
            </div>

            {/* Thank-you note from the Team Leader to the crew */}
            <figure className="mt-8 rounded-2xl border border-[#ff75a0]/30 bg-gradient-to-br from-[#ff75a0]/10 via-[#0c0004]/60 to-[#38bdf8]/10 p-6 sm:p-8 text-center space-y-4">
              <div className="flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#ff75a0]/40 bg-[#ff75a0]/15 px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-[#fda4af]">
                  <Sparkles className="size-3.5 text-[#ff75a0]" />
                  Thank you note
                </span>
              </div>
              <blockquote className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-3xl mx-auto italic">
                &ldquo;MetroGrid only made it to the Code2Create stage because of this crew. To Raphael, Pradyun, Kartikey, and Neelaksh — thank you for the late-night rehearsals, the sharp questions, the fearless pitching, and for believing in a city we built together. Leading <strong className="text-[#ff75a0] not-italic">Team BUG OFF</strong> was an honour.&rdquo;
              </blockquote>
              <figcaption className="text-xs font-mono text-[#38bdf8]">
                — Aayush Srivastava · Team Leader, BUG OFF
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Aspects of MetroGrid Section */}
        <section className="space-y-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-[#ff75a0] uppercase">
              <Box className="size-4" />
              <span>Comprehensive System Overview</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mt-1">
              Aspects of MetroGrid
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              MetroGrid operates as an integrated urban planning platform that bridges mathematical graph analysis, real-world geospatial data, and interactive 3D spatial design.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Aspect 1 */}
            <div className="rounded-2xl border border-white/10 bg-[#12040c]/80 p-6 space-y-3 hover:border-[#ff75a0]/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-[#ff75a0]/30 bg-[#ff75a0]/10 text-[#ff75a0]">
                  <Layers className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#ff75a0] uppercase tracking-wider block">CORE CANVAS</span>
                  <h3 className="text-base font-bold text-white">Procedural 2D/3D Grid Synthesis</h3>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Utilizes a sparse chunk coordinate map with zero baseline memory overhead. Planners can place Residential, Commercial, Industrial, and Park zones seamlessly in 2D or freeform spatial 3D with continuous height extrusions.
              </p>
            </div>

            {/* Aspect 2 */}
            <div className="rounded-2xl border border-white/10 bg-[#071324]/80 p-6 space-y-3 hover:border-[#38bdf8]/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 text-[#38bdf8]">
                  <Network className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#38bdf8] uppercase tracking-wider block">TRAFFIC DYNAMICS</span>
                  <h3 className="text-base font-bold text-white">Hierarchical Road Networks</h3>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Simulates real-world traffic topology with 4 tiered road classifications: local streets, avenues, arterial expressways, and highway ramps. Evaluates congestion and travel time via weighted Dijkstra pathfinding.
              </p>
            </div>

            {/* Aspect 3 */}
            <div className="rounded-2xl border border-white/10 bg-[#071324]/80 p-6 space-y-3 hover:border-[#38bdf8]/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <Globe className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">GEODATA INTEGRATION</span>
                  <h3 className="text-base font-bold text-white">OpenStreetMap (GIS) Ingestion</h3>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Empowers users to import actual metropolitan road layouts worldwide via Overpass API bounding boxes. Automatically rasterizes nodes and highway geometries into simulation-ready city layouts.
              </p>
            </div>

            {/* Aspect 4 */}
            <div className="rounded-2xl border border-white/10 bg-[#12040c]/80 p-6 space-y-3 hover:border-[#ff75a0]/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
                  <Zap className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block">ANALYTICS ENGINE</span>
                  <h3 className="text-base font-bold text-white">Live Algorithmic Scoring</h3>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Computes real-time livability, commute efficiency, pollution falloff, and resource equity. Instant feedback loops inform planners immediately of zoning imbalances or traffic bottlenecks.
              </p>
            </div>

            {/* Aspect 5 */}
            <div className="rounded-2xl border border-white/10 bg-[#12040c]/80 p-6 space-y-3 hover:border-[#ff75a0]/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-[#ff75a0]/30 bg-[#ff75a0]/10 text-[#ff75a0]">
                  <Layers className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#ff75a0] uppercase tracking-wider block">VERTICAL MOBILITY</span>
                  <h3 className="text-base font-bold text-white">Multi-Elevation Infrastructure</h3>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Full 5-tier elevation system spanning subterranean metro tunnels (-2, -1), surface thoroughfares (0), and elevated flyovers (+1, +2) with smooth transition ramps and multi-level vertical routing.
              </p>
            </div>

            {/* Aspect 6 */}
            <div className="rounded-2xl border border-white/10 bg-[#071324]/80 p-6 space-y-3 hover:border-[#38bdf8]/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl border border-sky-400/30 bg-sky-400/10 text-sky-400">
                  <Palette className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider block">SCHEMATICS</span>
                  <h3 className="text-base font-bold text-white">Architectural Blueprint Exporter</h3>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Generates high-resolution engineering schematics with cyan blueprint styling, localized zoning symbol stamps, density heatmaps, and elevation legends ready for production presentations.
              </p>
            </div>
          </div>
        </section>

        {/* Project Archive Status Notice */}
        <section className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/30 to-amber-900/10 p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500/20 p-1 text-amber-400">
              <ShieldCheck className="size-4" />
            </span>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
              Archive & Preservation Notice
            </span>
          </div>
          <p className="text-sm text-amber-100/90 font-mono leading-relaxed">
            &ldquo;This project is now archived. Some Features are now read only. Thank you.&rdquo;
          </p>
          <p className="text-xs text-amber-200/70 leading-relaxed">
            MetroGrid has concluded its active hackathon development phase. The core interactive simulation, GIS import engine, 3D viewport, and blueprint generation remain fully operational for exploration and review.
          </p>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-[#ff75a0]/20 bg-[#0c0004] px-4 sm:px-8 py-8 mt-16 text-center space-y-3 relative z-10">
        <div className="flex items-center justify-center gap-4 text-xs text-slate-400 flex-wrap">
          <a href="/" className="hover:text-white transition-colors">Landing Page</a>
          <span>•</span>
          <a href="/planner?t=1" className="hover:text-white transition-colors">Planner</a>
          <span>•</span>
          <a
            href="https://github.com/notaayushsrivastava/metrogrid"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ff75a0] hover:underline"
          >
            GitHub Repository
          </a>
          <span>•</span>
          <a
            href="https://github.com/notaayushsrivastava"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#38bdf8] hover:underline"
          >
            Team BUG OFF · Leader: @notaayushsrivastava
          </a>
        </div>
        <p className="text-xs text-slate-500">
          © 2026 Team BUG OFF · Aayush Srivastava. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

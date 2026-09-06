import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  CircleDot,
  Database,
  Grid3X3,
  Layers3,
  Map,
  Menu,
  Moon,
  Route,
  Sun,
  TrainFront,
  X,
  Zap,
} from "lucide-react";
import { animate } from "animejs";
import { prefersReducedMotion } from "../../lib/motion";
import type { Theme } from "../../hooks/useTheme";

interface LandingPageProps {
  theme: Theme;
  toggleTheme: () => void;
}

const features = [
  { icon: Grid3X3, title: "Interactive planning", copy: "Build block by block and see the consequences of every decision." },
  { icon: BarChart3, title: "Live simulation", copy: "Evaluate traffic, livability, and resources as the city changes." },
  { icon: Map, title: "GIS integration", copy: "Bring real-world geography into an editable planning environment." },
  { icon: Route, title: "Transport networks", copy: "Model pedestrian paths, local streets, transit, and highways." },
  { icon: Building2, title: "Spatial 3D", copy: "Turn a plan into a navigable spatial model when the layout is ready." },
  { icon: Zap, title: "Intelligent scoring", copy: "Measure the impact of each planning choice with a shared score model." },
];

function CitySchematic() {
  const routeRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!routeRef.current || prefersReducedMotion()) return;
    const animation = animate(routeRef.current, {
      strokeDashoffset: [0, -420],
      duration: 3600,
      ease: "linear",
      loop: true,
    });
    return () => {
      animation.pause();
    };
  }, []);

  return (
    <div className="landing-city" aria-label="Animated MetroGrid city model preview" role="img">
      <div className="city-meta city-meta-top"><span>METROGRID / EAST DISTRICT</span><span>LIVE MODEL 04</span></div>
      <svg viewBox="0 0 820 560" className="city-svg" aria-hidden="true">
        <defs>
          <pattern id="city-grid" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M 34 0 L 0 0 0 34" fill="none" stroke="currentColor" strokeWidth="1" opacity=".22" />
          </pattern>
          <linearGradient id="park-fill" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#7cffb2" stopOpacity=".3" />
            <stop offset="1" stopColor="#168a4a" stopOpacity=".08" />
          </linearGradient>
        </defs>
        <rect width="820" height="560" fill="url(#city-grid)" />
        <path d="M-40 440 C180 380 210 140 420 180 S650 320 860 80" fill="none" stroke="#27313d" strokeWidth="42" opacity=".9" />
        <path d="M-40 440 C180 380 210 140 420 180 S650 320 860 80" fill="none" stroke="#62a8ff" strokeWidth="2" strokeDasharray="6 16" opacity=".95" />
        <path d="M120 -20 L260 580 M-20 160 L850 430 M500 -20 L430 580" fill="none" stroke="#303b49" strokeWidth="13" opacity=".9" />
        <path ref={routeRef} d="M120 -20 L260 580 M-20 160 L850 430 M500 -20 L430 580" fill="none" stroke="#7cffb2" strokeWidth="2" strokeDasharray="3 24" strokeLinecap="round" />
        <path d="M515 280 L700 215 L762 316 L585 380 Z" fill="url(#park-fill)" stroke="#7cffb2" strokeWidth="1.5" />
        <g fill="#151922" stroke="#566273" strokeWidth="1.5">
          <path d="M50 70 h110 v70 H50z M180 70 h100 v70 H180z M66 170 h92 v86 H66z M180 170 h100 v86 H180z" />
          <path d="M330 48 h102 v88 H330z M450 60 h80 v76 H450z M320 170 h110 v80 H320z M450 170 h80 v80 H450z" />
          <path d="M60 320 h100 v76 H60z M180 310 h104 v86 H180z M300 320 h106 v76 H300z" />
          <path d="M550 70 h112 v82 H550z M680 70 h94 v82 H680z M560 430 h100 v70 H560z M680 405 h112 v95 H680z" />
        </g>
        <g fill="#f5f7fa" opacity=".62">
          <path d="M76 87h18v36H76z M108 87h24v36h-24z M198 88h18v32h-18z M350 64h24v46h-24z M475 76h16v38h-16z M575 90h28v44h-28z M710 92h22v38h-22z" />
        </g>
        <g fill="#7cffb2" opacity=".85"><circle cx="184" cy="455" r="5" /><circle cx="235" cy="432" r="4" /><circle cx="272" cy="472" r="5" /><circle cx="638" cy="280" r="5" /><circle cx="682" cy="260" r="4" /></g>
        <g className="city-label" fill="currentColor" fontFamily="monospace" fontSize="11" letterSpacing="1"><text x="535" y="405">PARK / 03</text><text x="50" y="292">RESIDENTIAL</text><text x="608" y="48">TRANSIT LOOP</text></g>
      </svg>
      <div className="city-meta city-meta-bottom"><span><CircleDot size={10} /> 48.8566 N / 2.3522 E</span><span className="city-live"><span /> MODEL RUNNING</span></div>
      <div className="city-score"><span>LIVEABILITY</span><strong>87</strong><small>+2.4 this run</small></div>
    </div>
  );
}

export function LandingPage({ theme, toggleTheme }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="MetroGrid home">
          <span className="brand-mark"><Grid3X3 size={17} strokeWidth={1.8} /></span>
          <span>MetroGrid</span>
        </a>
        <nav className={menuOpen ? "landing-links is-open" : "landing-links"} aria-label="Primary navigation">
          <a href="#product" onClick={() => setMenuOpen(false)}>Overview</a>
          <a href="/planner" onClick={() => setMenuOpen(false)}>Planner</a>
          <a href="#simulation" onClick={() => setMenuOpen(false)}>Simulation</a>
          <a href="#capabilities" onClick={() => setMenuOpen(false)}>Capabilities</a>
          <a href="#docs" onClick={() => setMenuOpen(false)}>Documentation</a>
        </nav>
        <div className="landing-actions">
          <button className="icon-action" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <a href="/planner" className="nav-cta">Open planner <ArrowUpRight size={15} /></a>
          <button className="menu-action" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="product">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> URBAN SYSTEMS / 01</div>
            <h1>Design cities<br /><em>with consequence.</em></h1>
            <p>Model urban environments, simulate infrastructure, and understand how every planning decision changes the city.</p>
            <div className="hero-actions">
              <a href="/planner" className="primary-cta">Open planner <ArrowUpRight size={17} /></a>
              <a href="#simulation" className="text-cta">Explore simulation <ChevronRight size={16} /></a>
            </div>
            <div className="hero-note"><span className="status-pip" /> No account required <span className="note-divider" /> Start with a blank grid</div>
          </div>
          <CitySchematic />
        </section>

        <section className="metric-strip" aria-label="MetroGrid platform metrics">
          <div><span>01</span><strong>4.8M</strong><small>cells modelled</small></div>
          <div><span>02</span><strong>98.4%</strong><small>simulation uptime</small></div>
          <div><span>03</span><strong>12.6K</strong><small>plans evaluated</small></div>
          <div><span>04</span><strong>24ms</strong><small>average response</small></div>
        </section>

        <section className="content-section feature-section" id="simulation">
          <div className="section-intro"><div className="eyebrow"><span className="eyebrow-line" /> THE WORKBENCH / 02</div><h2>Plan. Simulate.<br /><em>Understand.</em></h2><p>The city is a living system. MetroGrid keeps the model visible while you shape it, so trade-offs become legible before they become expensive.</p></div>
          <div className="feature-grid">{features.map(({ icon: Icon, title, copy }, index) => <article className="feature-item" key={title}><span className="feature-index">0{index + 1}</span><Icon size={19} strokeWidth={1.6} /><h3>{title}</h3><p>{copy}</p><ArrowUpRight className="feature-arrow" size={16} /></article>)}</div>
        </section>

        <section className="workbench-section">
          <div className="workbench-frame">
            <div className="workbench-toolbar"><span className="toolbar-title"><span className="brand-mark small"><Grid3X3 size={13} /></span> New city / Untitled</span><span className="toolbar-status"><span className="status-pip" /> synced</span><span className="toolbar-coords">X 048.12 / Y 016.82</span></div>
            <div className="workbench-body"><aside className="workbench-rail"><div className="rail-active"><Grid3X3 size={17} /></div><Map size={17} /><Layers3 size={17} /><Database size={17} /><div className="rail-spacer" /><Sun size={17} /></aside><div className="mini-map"><div className="mini-map-grid" /><div className="mini-road road-one" /><div className="mini-road road-two" /><div className="mini-zone zone-a" /><div className="mini-zone zone-b" /><div className="mini-zone zone-c" /><div className="mini-pin"><CircleDot size={13} /></div><span className="map-label label-one">NORTH QUARTER</span><span className="map-label label-two">GREEN BELT</span></div><aside className="workbench-inspector"><div className="inspector-kicker">SELECTED ZONE</div><h3>North Quarter</h3><span className="inspector-type"><Building2 size={13} /> Residential / high density</span><div className="inspector-rule" /><div className="inspector-stat"><span>Livability</span><strong>92 <i>+10</i></strong></div><div className="inspector-stat"><span>Traffic</span><strong>68 <i className="down">-5</i></strong></div><div className="inspector-stat"><span>Resources</span><strong>84 <i>+4</i></strong></div><div className="inspector-foot"><TrainFront size={14} /> Transit access · 240m</div></aside></div><div className="workbench-footer"><span><span className="footer-dot green" /> simulation active</span><span>population <strong>124,820</strong></span><span>network load <strong>68%</strong></span><span>active cells <strong>2,481</strong></span></div>
          </div>
        </section>

        <section className="content-section capability-section" id="capabilities"><div className="section-intro compact"><div className="eyebrow"><span className="eyebrow-line" /> SYSTEM CAPABILITIES / 03</div><h2>Infrastructure for<br /><em>better decisions.</em></h2></div><div className="capability-list"><div><span>01</span><Zap size={16} /><strong>Interactive grid engine</strong><small>Sparse spatial state / real-time updates</small></div><div><span>02</span><Route size={16} /><strong>Weighted pathfinding</strong><small>Multi-modal network analysis</small></div><div><span>03</span><Map size={16} /><strong>GIS import</strong><small>GeoJSON / raster / area selection</small></div><div><span>04</span><BarChart3 size={16} /><strong>Real-time scoring</strong><small>Livability / traffic / resources</small></div></div></section>

        <section className="closing-section" id="docs"><div className="eyebrow"><span className="eyebrow-line" /> METROGRID / 04</div><h2>The next city<br /><em>starts here.</em></h2><a href="/planner" className="primary-cta">Open planner <ArrowUpRight size={17} /></a></section>
      </main>
      <footer className="landing-footer"><a className="landing-brand" href="/"><span className="brand-mark"><Grid3X3 size={17} /></span><span>MetroGrid</span></a><span>Urban planning, simulated.</span><div><a href="/planner">Planner</a><a href="#simulation">Simulation</a><a href="#docs">Docs</a><a href="mailto:hello@metrogrid.local">Contact</a></div><small>© 2026 MetroGrid Systems</small></footer>
    </div>
  );
}
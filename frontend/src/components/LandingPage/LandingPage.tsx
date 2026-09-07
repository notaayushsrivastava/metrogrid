import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CircleDot,
  Grid3X3,
  LocateFixed,
  Map,
  Menu,
  Moon,
  Route,
  ScanLine,
  Sun,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { animate } from "animejs";
import { prefersReducedMotion } from "../../lib/motion";
import type { Theme } from "../../hooks/useTheme";
import type { GridState, TileType } from "../../types/city";
import type { PresentationCameraState } from "../CityCanvas3D/CityCanvas3D";

const DemoCityCanvas = lazy(() =>
  import("../CityCanvas3D/CityCanvas3D").then((module) => ({
    default: module.CityCanvas3D,
  }))
);

interface LandingPageProps {
  theme: Theme;
  toggleTheme: () => void;
}

interface CameraState {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  tilt: number;
}

interface SceneDefinition {
  id: string;
  eyebrow: string;
  title: string;
  emphasis: string;
  copy: string;
  camera: CameraState;
  annotation: string;
  metric?: "scores" | "transport" | "gis" | "simulation" | "complete";
}

const scenes: SceneDefinition[] = [
  { id: "intro", eyebrow: "URBAN SYSTEMS / 01", title: "Design better", emphasis: "cities.", copy: "Build, simulate, and understand urban environments from one living model.", camera: { x: 0, y: 0, scale: 1, rotate: 0, tilt: 0 }, annotation: "CITY MODEL / 04" },
  { id: "build", eyebrow: "PLANNER / 02", title: "Build block", emphasis: "by block.", copy: "Place zones, infrastructure, and green spaces directly onto the city grid.", camera: { x: -5, y: 3, scale: 1.22, rotate: -1, tilt: 0 }, annotation: "RESIDENTIAL ZONE" },
  { id: "consequences", eyebrow: "SCORING ENGINE / 03", title: "Every decision", emphasis: "has a consequence.", copy: "See how layout affects livability, traffic, and access to resources in real time.", camera: { x: 7, y: -2, scale: 1.33, rotate: 1, tilt: 0 }, annotation: "RESOURCE ACCESS", metric: "scores" },
  { id: "transport", eyebrow: "MOVEMENT / 04", title: "Model movement", emphasis: "at every scale.", copy: "Follow weighted routes from pedestrian paths to express highways and transit corridors.", camera: { x: -13, y: -5, scale: 1.56, rotate: -3, tilt: 0 }, annotation: "TRANSIT CORRIDOR", metric: "transport" },
  { id: "gis", eyebrow: "GEO DATA / 05", title: "Start with", emphasis: "the real world.", copy: "Import geographic data and turn real environments into simulation-ready city grids.", camera: { x: 5, y: 6, scale: 1.28, rotate: 0, tilt: 0 }, annotation: "GIS LAYER", metric: "gis" },
  { id: "spatial", eyebrow: "SPATIAL VIEW / 06", title: "See the city", emphasis: "in another dimension.", copy: "Raise buildings, add depth, and inspect the plan as a spatial environment.", camera: { x: 0, y: 2, scale: 1.22, rotate: -4, tilt: 23 }, annotation: "3D BUILDINGS" },
  { id: "simulation", eyebrow: "SIMULATION / 07", title: "Design. Simulate.", emphasis: "Improve.", copy: "Understand the consequences before you build, then make the next move with evidence.", camera: { x: 0, y: 0, scale: 0.96, rotate: 0, tilt: 8 }, annotation: "SIMULATION ACTIVE", metric: "simulation" },
  { id: "complete", eyebrow: "METROGRID / 08", title: "The next city", emphasis: "starts here.", copy: "A precise workspace for planning, movement, data, and spatial decisions.", camera: { x: 0, y: 0, scale: 0.82, rotate: 0, tilt: 0 }, annotation: "FULL PLATFORM", metric: "complete" },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function ease(value: number) {
  return value * value * (3 - 2 * value);
}

function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? clamp(window.scrollY / max) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return progress;
}

function useMetroCamera(progress: number) {
  return useMemo(() => {
    const position = progress * (scenes.length - 1);
    const index = Math.min(Math.floor(position), scenes.length - 2);
    const segmentProgress = position - index;
    const hold = 0.2;
    const motionProgress = clamp((segmentProgress - hold) / (1 - hold * 2));
    const amount = ease(motionProgress);
    const from = scenes[index].camera;
    const to = scenes[index + 1].camera;
    return {
      x: mix(from.x, to.x, amount),
      y: mix(from.y, to.y, amount),
      scale: mix(from.scale, to.scale, amount),
      rotate: mix(from.rotate, to.rotate, amount),
      tilt: mix(from.tilt, to.tilt, amount),
    };
  }, [progress]);
}

function sceneProgress(progress: number, index: number) {
  const distance = Math.abs(progress * (scenes.length - 1) - index);
  const hold = 0.2;
  return clamp(1 - Math.max(0, distance - hold) / (1 - hold));
}

function createDemoCity(): GridState {
  const tiles: GridState = new globalThis.Map<string, { type: TileType }>();
  const place = (x: number, y: number, type: TileType) => tiles.set(`${x},${y}`, { type });

  for (let x = 0; x < 16; x += 1) {
    place(x, 5, x % 5 === 0 ? 42 : 41);
    place(x, 10, x % 4 === 0 ? 43 : 41);
  }
  for (let y = 0; y < 14; y += 1) {
    place(4, y, y % 5 === 0 ? 42 : 41);
    place(11, y, y % 4 === 0 ? 43 : 41);
  }

  const residential = [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [6, 1], [7, 1], [6, 2], [7, 2]];
  const commercial = [[6, 7], [7, 7], [8, 7], [6, 8], [7, 8], [8, 8], [13, 2], [14, 2], [13, 3], [14, 3]];
  const green = [[1, 7], [2, 7], [1, 8], [2, 8], [9, 1], [9, 2], [10, 1], [10, 2]];
  const industrial = [[13, 7], [14, 7], [13, 8], [14, 8]];
  residential.forEach(([x, y]) => place(x, y, 1));
  commercial.forEach(([x, y]) => place(x, y, 2));
  green.forEach(([x, y]) => place(x, y, 3));
  industrial.forEach(([x, y]) => place(x, y, 5));
  return tiles;
}

const DEMO_CITY = createDemoCity();

function getPresentationCamera(camera: CameraState): PresentationCameraState {
  const orbit = (camera.rotate * Math.PI) / 180;
  const distance = Math.max(16, 34 / camera.scale);
  const height = 17 + camera.tilt * 0.34;
  return {
    position: [8 + camera.x * 0.12 + Math.sin(orbit) * distance, height, -6 - camera.y * 0.12 + Math.cos(orbit) * distance],
    target: [7 + camera.x * 0.05, 0, -6 - camera.y * 0.05],
  };
}

function CityModel({ camera, progress }: { camera: CameraState; progress: number }) {
  const presentationCamera = useMemo(() => getPresentationCamera(camera), [camera]);
  return (
    <div className="narrative-city" aria-label="MetroGrid interactive 3D city model" role="img">
      <div className="city-frame-line" />
      <div className="narrative-city-meta">
        <span>METROGRID / EAST DISTRICT</span>
        <span>{String(Math.round(progress * 100)).padStart(2, "0")} / 100</span>
      </div>
      <div className="narrative-real-city">
        <Suspense fallback={<div className="narrative-city-loading"><span className="status-pip" /> LOADING CITY MODEL</div>}>
          <DemoCityCanvas tiles={DEMO_CITY} activeTool="select" presentationCamera={presentationCamera} />
        </Suspense>
      </div>
      <div className="narrative-city-bottom">
        <span className="city-live"><span /> MODEL RUNNING</span>
        <span><LocateFixed size={12} /> 48.8566 N / 2.3522 E</span>
      </div>
    </div>
  );
}

function PlannerOverlay({ progress }: { progress: number }) {
  const active = progress > 0.08 && progress < 0.38;
  return (
    <div className={active ? "planner-overlay is-visible" : "planner-overlay"}>
      <div className="overlay-kicker">PLANNER TOOLS</div>
      <div className="planner-tools">
        <span className="is-active"><Building2 size={14} /> Residential</span>
        <span><Building2 size={14} /> Commercial</span>
        <span><Zap size={14} /> Industrial</span>
        <span><ScanLine size={14} /> Park</span>
        <span><Route size={14} /> Road</span>
      </div>
      <div className="placement-cursor"><CircleDot size={18} /><span>PLACE ZONE</span></div>
    </div>
  );
}

function MetricOverlay({ kind, progress }: { kind: SceneDefinition["metric"]; progress: number }) {
  if (!kind) return null;
  const scores = kind === "scores"
    ? { livability: Math.round(mix(87, 72, clamp((progress - 0.22) * 6))), traffic: Math.round(mix(72, 80, clamp((progress - 0.22) * 6))), resources: Math.round(mix(91, 81, clamp((progress - 0.22) * 6))) }
    : { livability: 87, traffic: 72, resources: 91 };
  return (
    <div className={`narrative-metrics metric-${kind}`}>
      <div className="metrics-kicker">{kind === "simulation" ? "SIMULATION / RUNNING" : kind === "gis" ? "GIS / IMPORTED LAYER" : kind === "transport" ? "NETWORK / ROUTE" : "CITY METRICS"}</div>
      {kind === "transport" && <div className="transport-legend"><span><i className="pedestrian" /> pedestrian</span><span><i className="transit" /> transit</span><span><i className="highway" /> highway</span></div>}
      {kind === "gis" && <div className="gis-import"><Upload size={15} /><span>district.geojson</span><strong>100%</strong></div>}
      {(kind === "scores" || kind === "simulation" || kind === "complete") && <div className="score-list">{Object.entries(scores).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong><i className={label === "traffic" ? "delta bad" : "delta"}>{label === "traffic" ? "+8" : kind === "simulation" ? "+6" : label === "livability" ? "-15" : "-10"}</i></div>)}</div>}
      {kind === "complete" && <div className="platform-tags"><span><Map size={12} /> GIS</span><span><Route size={12} /> TRAFFIC</span><span><Building2 size={12} /> 3D</span></div>}
    </div>
  );
}

function SceneNarrative({ scene, index, progress, active }: { scene: SceneDefinition; index: number; progress: number; active: boolean }) {
  const visibility = sceneProgress(progress, index);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || prefersReducedMotion()) return;
    const animation = animate(card, active ? { opacity: [0, 1], translateY: [16, 0], scale: [0.98, 1], duration: 420, ease: "outCubic" } : { opacity: [1, 0], translateY: [0, -8], duration: 300, ease: "inCubic" });
    return () => { animation.pause(); };
  }, [active]);

  return (
    <article className={active ? "scene-copy is-active" : "scene-copy"} style={{ opacity: visibility, transform: `translateY(calc(var(--scene-shift, -50%) + ${(1 - visibility) * 22}px))`, pointerEvents: visibility > 0.5 ? "auto" : "none" }} aria-hidden={visibility < 0.5}>
      <div ref={cardRef} className="narrative-card">
        <div className="narrative-card-mark"><CircleDot size={14} /></div>
        <div className="eyebrow"><span className="eyebrow-line" /> {scene.eyebrow}</div>
        <h1>{scene.title}<br /><em>{scene.emphasis}</em></h1>
        <p>{scene.copy}</p>
        {index === 0 && <div className="scene-card-actions"><a href="/planner" className="primary-cta">Open planner <ArrowUpRight size={15} /></a><a href="#story" className="text-cta">Explore MetroGrid <ChevronRight size={15} /></a></div>}
        <span className="scene-index">0{index + 1} / 08 <span>{scene.annotation}</span></span>
      </div>
    </article>
  );
}

export function LandingPage({ theme, toggleTheme }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const progress = useScrollProgress();
  const camera = useMetroCamera(progress);
  const scenePosition = progress * (scenes.length - 1);
  const activeIndex = Math.min(Math.round(scenePosition), scenes.length - 1);
  const scene = scenes[activeIndex];
  const reduced = prefersReducedMotion();

  return (
    <div className="narrative-page">
      <header className="narrative-nav">
        <a className="landing-brand" href="/" aria-label="MetroGrid home"><span className="brand-mark"><Grid3X3 size={17} strokeWidth={1.8} /></span><span>MetroGrid</span></a>
        <nav className={menuOpen ? "narrative-links is-open" : "narrative-links"} aria-label="Primary navigation">
          <a href="/planner" onClick={() => setMenuOpen(false)}>Planner</a><a href="#story" onClick={() => setMenuOpen(false)}>Simulation</a><a href="#story" onClick={() => setMenuOpen(false)}>GIS</a><a href="/planner" onClick={() => setMenuOpen(false)}>3D</a>
        </nav>
        <div className="narrative-actions"><button className="icon-action" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button><a href="/planner" className="nav-cta">Open planner <ArrowUpRight size={15} /></a><button className="menu-action" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div>
      </header>
      <main id="story" className="narrative-story">
        <div className="story-stage">
          <div className="story-viewport"><div className="story-chrome"><span><span className="status-pip" /> LIVE MODEL</span><span>{scene.annotation}</span></div><CityModel camera={reduced ? scenes[0].camera : camera} progress={progress} /><PlannerOverlay progress={progress} /><MetricOverlay kind={scene.metric} progress={progress} /><div className="narrative-scroll-label"><ArrowDown size={14} /> SCROLL TO EXPLORE</div></div>
          <div className="scene-copy-layer">{scenes.map((item, index) => <SceneNarrative key={item.id} scene={item} index={index} active={activeIndex === index} progress={reduced ? (index === 0 ? 1 : 0) : progress} />)}</div>
          <div className="story-progress" aria-label={`Story progress: ${Math.round(progress * 100)} percent`}><span style={{ height: `${Math.max(3, progress * 100)}%` }} /><i>{String(activeIndex + 1).padStart(2, "0")}</i></div>
        </div>
        <section className="final-narrative"><div className="eyebrow"><span className="eyebrow-line" /> METROGRID / 09</div><h2>Build the city<br /><em>you can imagine.</em></h2><p>Explore MetroGrid and start designing.</p><div className="final-actions"><a href="/planner" className="primary-cta">Open planner <ArrowUpRight size={17} /></a><a href="#story" className="text-cta">Explore documentation <ChevronRight size={16} /></a></div></section>
      </main>
      <footer className="landing-footer narrative-footer"><a className="landing-brand" href="/"><span className="brand-mark"><Grid3X3 size={17} /></span><span>MetroGrid</span></a><span>Urban planning, simulated.</span><small>© 2026 MetroGrid Systems</small></footer>
    </div>
  );
}

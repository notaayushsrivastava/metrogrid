import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Building2, ChevronRight, CircleDot, Grid3X3, LocateFixed, Map, Menu, Moon, Route, ScanLine, Sun, Upload, X, Zap } from "lucide-react";
import { animate } from "animejs";
import { prefersReducedMotion } from "../../lib/motion";
import type { Theme } from "../../hooks/useTheme";

interface LandingPageProps { theme: Theme; toggleTheme: () => void; }
interface CameraState { x: number; y: number; scale: number; rotate: number; tilt: number; }
interface SceneDefinition { id: string; eyebrow: string; title: string; emphasis: string; copy: string; camera: CameraState; annotation: string; metric?: "scores" | "transport" | "gis" | "simulation" | "complete"; }

const scenes: SceneDefinition[] = [
  { id: "intro", eyebrow: "URBAN SYSTEMS / 01", title: "Design better", emphasis: "cities.", copy: "Build, simulate, and understand urban environments from one living model.", camera: { x: 0, y: 0, scale: 1, rotate: 0, tilt: 0 }, annotation: "CITY MODEL / 04" },
  { id: "build", eyebrow: "PLANNER / 02", title: "Build block", emphasis: "by block.", copy: "Place zones, infrastructure, and green spaces directly onto the city grid.", camera: { x: -5, y: 3, scale: 1.22, rotate: -1, tilt: 0 }, annotation: "RESIDENTIAL ZONE" },
  { id: "consequences", eyebrow: "SCORING ENGINE / 03", title: "Every decision", emphasis: "has a consequence.", copy: "See how layout affects livability, traffic, and access to resources in real time.", camera: { x: 7, y: -2, scale: 1.33, rotate: 1, tilt: 0 }, annotation: "RESOURCE ACCESS", metric: "scores" },
  { id: "transport", eyebrow: "MOVEMENT / 04", title: "Model movement", emphasis: "at every scale.", copy: "Follow weighted routes from pedestrian paths to express highways and transit corridors.", camera: { x: -13, y: -5, scale: 1.56, rotate: -3, tilt: 0 }, annotation: "TRANSIT CORRIDOR", metric: "transport" },
  { id: "gis", eyebrow: "GEO DATA / 05", title: "Start with", emphasis: "the real world.", copy: "Import geographic data and turn real environments into simulation-ready city grids.", camera: { x: 5, y: 6, scale: 1.28, rotate: 0, tilt: 0 }, annotation: "GIS LAYER", metric: "gis" },
  { id: "spatial", eyebrow: "SPATIAL VIEW / 06", title: "See the city", emphasis: "in another dimension.", copy: "Raise buildings, add depth, and inspect the plan as a spatial environment.", camera: { x: 0, y: 2, scale: 1.22, rotate: -4, tilt: 23 }, annotation: "3D BUILDINGS" },
  { id: "simulation", eyebrow: "SIMULATION / 07", title: "Design. Simulate.", emphasis: "Improve.", copy: "Understand the consequences before you build, then make the next move with evidence.", camera: { x: 0, y: 0, scale: .96, rotate: 0, tilt: 8 }, annotation: "SIMULATION ACTIVE", metric: "simulation" },
  { id: "complete", eyebrow: "METROGRID / 08", title: "The next city", emphasis: "starts here.", copy: "A precise workspace for planning, movement, data, and spatial decisions.", camera: { x: 0, y: 0, scale: .82, rotate: 0, tilt: 0 }, annotation: "FULL PLATFORM", metric: "complete" },
];

function clamp(value: number, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }
function mix(from: number, to: number, amount: number) { return from + (to - from) * amount; }
function ease(value: number) { return value * value * (3 - 2 * value); }

function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; const max = document.documentElement.scrollHeight - window.innerHeight; setProgress(max > 0 ? clamp(window.scrollY / max) : 0); };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update(); window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, []);
  return progress;
}

function useMetroCamera(progress: number) {
  return useMemo(() => { const position = progress * (scenes.length - 1); const index = Math.min(Math.floor(position), scenes.length - 2); const segmentProgress = position - index; const hold = .2; const motionProgress = clamp((segmentProgress - hold) / (1 - hold * 2)); const amount = ease(motionProgress); const from = scenes[index].camera; const to = scenes[index + 1].camera; return { x: mix(from.x, to.x, amount), y: mix(from.y, to.y, amount), scale: mix(from.scale, to.scale, amount), rotate: mix(from.rotate, to.rotate, amount), tilt: mix(from.tilt, to.tilt, amount) }; }, [progress]);
}
function sceneProgress(progress: number, index: number) { const distance = Math.abs(progress * (scenes.length - 1) - index); const hold = .2; return clamp(1 - Math.max(0, distance - hold) / (1 - hold)); }

function CityModel({ camera, progress }: { camera: CameraState; progress: number }) {
  const routeRef = useRef<SVGPathElement>(null);
  useEffect(() => { if (!routeRef.current || prefersReducedMotion()) return; const loop = animate(routeRef.current, { strokeDashoffset: [0, -420], duration: 3600, ease: "linear", loop: true }); return () => { loop.pause(); }; }, []);
  const buildings = ["M50 70h110v70H50z M180 70h100v70H180z M66 170h92v86H66z M180 170h100v86H180z", "M330 48h102v88H330z M450 60h80v76H450z M320 170h110v80H320z M450 170h80v80H450z", "M60 320h100v76H60z M180 310h104v86H180z M300 320h106v76H300z", "M550 70h112v82H550z M680 70h94v82H680z M560 430h100v70H560z M680 405h112v95H680z"];
  const extrude = camera.tilt > 4;
  useEffect(() => {
    const city = document.querySelector<HTMLElement>(".narrative-city");
    if (!city) return;
    city.style.setProperty("--camera-offset-x", `${camera.x * 0.8}vw`);
    city.style.setProperty("--camera-offset-y", `${camera.y * 0.7}vh`);
    city.style.setProperty("--camera-scale", String(camera.scale));
    city.style.setProperty("--camera-rotate", `${camera.rotate}deg`);
    city.style.setProperty("--camera-tilt", `${camera.tilt}deg`);
  }, [camera]);
  return <div className="narrative-city" aria-label="MetroGrid interactive city model" role="img"><div className="city-frame-line" /><div className="narrative-city-meta"><span>METROGRID / EAST DISTRICT</span><span>{String(Math.round(progress * 100)).padStart(2, "0")} / 100</span></div><div className="camera-stage" style={{ transform: `translate3d(${camera.x}%, ${camera.y}%, 0) scale(${camera.scale}) rotate(${camera.rotate}deg) rotateX(${camera.tilt}deg)`, perspective: 900 }}><svg viewBox="0 0 820 560" className={extrude ? "city-model is-spatial" : "city-model"} aria-hidden="true"><defs><pattern id="narrative-grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0L0 0 0 34" fill="none" stroke="currentColor" strokeWidth="1" opacity=".22" /></pattern><linearGradient id="park-fill-narrative" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#7cffb2" stopOpacity=".3" /><stop offset="1" stopColor="#168a4a" stopOpacity=".08" /></linearGradient></defs><rect width="820" height="560" fill="url(#narrative-grid)" /><path d="M-40 440C180 380 210 140 420 180S650 320 860 80" fill="none" stroke="#27313d" strokeWidth="42" opacity=".9" /><path d="M-40 440C180 380 210 140 420 180S650 320 860 80" fill="none" stroke="#62a8ff" strokeWidth="2" strokeDasharray="6 16" opacity=".95" /><path d="M120 -20L260 580M-20 160L850 430M500 -20L430 580" fill="none" stroke="#303b49" strokeWidth="13" opacity=".9" /><path ref={routeRef} d="M120 -20L260 580M-20 160L850 430M500 -20L430 580" fill="none" stroke="#7cffb2" strokeWidth="2" strokeDasharray="3 24" strokeLinecap="round" /><path d="M515 280L700 215L762 316L585 380Z" fill="url(#park-fill-narrative)" stroke="#7cffb2" strokeWidth="1.5" /><g className="city-buildings" fill="#151922" stroke="#566273" strokeWidth="1.5">{buildings.map((path) => <path key={path} d={path} />)}</g><g fill="#f5f7fa" opacity=".62"><path d="M76 87h18v36H76zM108 87h24v36h-24zM198 88h18v32h-18zM350 64h24v46h-24zM475 76h16v38h-16zM575 90h28v44h-28zM710 92h22v38h-22z" /></g><g fill="#7cffb2" opacity=".85"><circle cx="184" cy="455" r="5" /><circle cx="235" cy="432" r="4" /><circle cx="272" cy="472" r="5" /><circle cx="638" cy="280" r="5" /><circle cx="682" cy="260" r="4" /></g><g className="city-label" fill="currentColor" fontFamily="monospace" fontSize="11" letterSpacing="1"><text x="535" y="405">PARK / 03</text><text x="50" y="292">RESIDENTIAL</text><text x="608" y="48">TRANSIT LOOP</text></g></svg>{extrude && <div className="building-shadow" />}</div><div className="city-controls"><button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button><button aria-label="Locate city"><LocateFixed size={13} /></button></div><div className="narrative-city-bottom"><span><CircleDot size={10} /> 48.8566 N / 2.3522 E</span><span className="city-live"><span /> MODEL RUNNING</span></div></div>;
}

function PlannerOverlay({ progress }: { progress: number }) { const active = progress > .08 && progress < .38; return <div className={active ? "planner-overlay is-visible" : "planner-overlay"}><div className="overlay-kicker">PLANNER TOOLS</div><div className="planner-tools"><span className="is-active"><Building2 size={14} /> Residential</span><span><Building2 size={14} /> Commercial</span><span><Zap size={14} /> Industrial</span><span><ScanLine size={14} /> Park</span><span><Route size={14} /> Road</span></div><div className="placement-cursor"><CircleDot size={18} /><span>PLACE ZONE</span></div></div>; }

function MetricOverlay({ kind, progress }: { kind: SceneDefinition["metric"]; progress: number }) {
  if (!kind) return null;
  const scores = kind === "scores" ? { livability: Math.round(mix(87, 72, clamp((progress - .22) * 6))), traffic: Math.round(mix(72, 80, clamp((progress - .22) * 6))), resources: Math.round(mix(91, 81, clamp((progress - .22) * 6))) } : { livability: 87, traffic: 72, resources: 91 };
  return <div className={`narrative-metrics metric-${kind}`}><div className="metrics-kicker">{kind === "simulation" ? "SIMULATION / RUNNING" : kind === "gis" ? "GIS / IMPORTED LAYER" : kind === "transport" ? "NETWORK / ROUTE" : "CITY METRICS"}</div>{kind === "transport" && <div className="transport-legend"><span><i className="pedestrian" /> pedestrian</span><span><i className="transit" /> transit</span><span><i className="highway" /> highway</span></div>}{kind === "gis" && <div className="gis-import"><Upload size={15} /><span>district.geojson</span><strong>100%</strong></div>}{(kind === "scores" || kind === "simulation" || kind === "complete") && <div className="score-list">{Object.entries(scores).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong><i className={label === "traffic" ? "delta bad" : "delta"}>{label === "traffic" ? "+8" : kind === "simulation" ? "+6" : label === "livability" ? "-15" : "-10"}</i></div>)}</div>}{kind === "complete" && <div className="platform-tags"><span><Map size={12} /> GIS</span><span><Route size={12} /> TRAFFIC</span><span><Building2 size={12} /> 3D</span></div>}</div>;
}

function SceneNarrative({ scene, index, progress, active }: { scene: SceneDefinition; index: number; progress: number; active: boolean }) {
  const visibility = sceneProgress(progress, index);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || prefersReducedMotion()) return;
    animate(card, active ? {
      opacity: [0, 1],
      translateY: [16, 0],
      scale: [.98, 1],
      duration: 420,
      ease: "outCubic",
    } : {
      opacity: [1, 0],
      translateY: [0, -8],
      duration: 300,
      ease: "inCubic",
    });
  }, [active]);

  return <article className={active ? "scene-copy is-active" : "scene-copy"} style={{ opacity: visibility, transform: `translateY(${(1 - visibility) * 22}px)`, pointerEvents: visibility > .5 ? "auto" : "none" }} aria-hidden={visibility < .5}>
    <div ref={cardRef} className="narrative-card">
      <div className="narrative-card-mark"><CircleDot size={14} /></div>
      <div className="eyebrow"><span className="eyebrow-line" /> {scene.eyebrow}</div>
      <h1>{scene.title}<br /><em>{scene.emphasis}</em></h1>
      <p>{scene.copy}</p>
      <span className="scene-index">0{index + 1} / 08 <span>{scene.annotation}</span></span>
    </div>
  </article>;
}

export function LandingPage({ theme, toggleTheme }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false); const progress = useScrollProgress(); const camera = useMetroCamera(progress); const scenePosition = progress * (scenes.length - 1); const activeIndex = Math.min(Math.round(scenePosition), scenes.length - 1); const scene = scenes[activeIndex]; const reduced = prefersReducedMotion();
  return <div className="narrative-page"><header className="narrative-nav"><a className="landing-brand" href="/" aria-label="MetroGrid home"><span className="brand-mark"><Grid3X3 size={17} strokeWidth={1.8} /></span><span>MetroGrid</span></a><nav className={menuOpen ? "narrative-links is-open" : "narrative-links"} aria-label="Primary navigation"><a href="/planner" onClick={() => setMenuOpen(false)}>Planner</a><a href="#story" onClick={() => setMenuOpen(false)}>Simulation</a><a href="#story" onClick={() => setMenuOpen(false)}>GIS</a><a href="/planner" onClick={() => setMenuOpen(false)}>3D</a></nav><div className="narrative-actions"><button className="icon-action" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button><a href="/planner" className="nav-cta">Open planner <ArrowUpRight size={15} /></a><button className="menu-action" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div></header><main id="story" className="narrative-story"><div className="story-stage"><div className="story-viewport"><div className="story-chrome"><span><span className="status-pip" /> LIVE MODEL</span><span>{scene.annotation}</span></div><CityModel camera={reduced ? scenes[0].camera : camera} progress={progress} /><PlannerOverlay progress={progress} /><MetricOverlay kind={scene.metric} progress={progress} /><div className="narrative-scroll-label"><ArrowDown size={14} /> SCROLL TO EXPLORE</div></div><div className="scene-copy-layer">{scenes.map((item, index) => <SceneNarrative key={item.id} scene={item} index={index} active={activeIndex === index} progress={reduced ? index === 0 ? 1 : 0 : progress} />)}</div><div className="story-progress" aria-label={`Story progress: ${Math.round(progress * 100)} percent`}><span style={{ height: `${Math.max(3, progress * 100)}%` }} /><i>{String(activeIndex + 1).padStart(2, "0")}</i></div></div><section className="final-narrative"><div className="eyebrow"><span className="eyebrow-line" /> METROGRID / 09</div><h2>Build the city<br /><em>you can imagine.</em></h2><p>Explore MetroGrid and start designing.</p><div className="final-actions"><a href="/planner" className="primary-cta">Open planner <ArrowUpRight size={17} /></a><a href="#story" className="text-cta">Explore documentation <ChevronRight size={16} /></a></div></section></main><footer className="landing-footer narrative-footer"><a className="landing-brand" href="/"><span className="brand-mark"><Grid3X3 size={17} /></span><span>MetroGrid</span></a><span>Urban planning, simulated.</span><small>© 2026 MetroGrid Systems</small></footer></div>;
}
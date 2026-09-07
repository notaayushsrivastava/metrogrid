/**
 * FreeformCanvas3D — 3D WebGL Spatial Canvas (PRD Phase 5).
 * 1 WebGL unit = 1 meter.
 *
 * Optimized for large map regions (1000s of structures/roads):
 * - Instanced mesh batching for large counts (prevents page freezes & frame drops).
 * - Level of Detail (LOD) camera tracking: hides DOM labels when zoomed out.
 * - Dynamic high-detail labels & building overlays upon zooming in.
 * - "Hide Zones" mode: hides building zones while preserving street polyline & traffic flow layout.
 * - Accessibility: strict click vs drag check (zones only add on clean click, not camera orbit drag).
 * - WASD map panning & Q/E elevation controls for 3D camera navigation.
 */

import { useState, useRef, useEffect, useMemo, createContext, useContext } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, TransformControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Eye, EyeOff, Compass, Layers, ArrowDownToLine } from "lucide-react";
import type { FreeformZoneMesh } from "../../utils/freeform";
import { calculatePhysicalFootprint } from "../../utils/freeform";
import type { SpatialRoad, RoadSubtype } from "../../types/spatial";
import { getRoadLevel, getRoadPointElevation, LEVEL_SHORT_BADGES, getDefaultRoadWidth } from "../../utils/freeformRoads";
import { TILE_META } from "../../config/tiles";

interface FreeformCanvas3DProps {
  meshes: FreeformZoneMesh[];
  roads?: SpatialRoad[];
  terrain?: Map<string, number>;
  terrainMode?: import("../../types/spatial").TerrainEditMode;
  terrainRadius?: number;
  terrainStrength?: number;
  onEditTerrain?: (center: { x: number; y: number }, mode: import("../../types/spatial").TerrainEditMode, radius: number, strength: number) => void;
  selectedMeshId: string | null;
  selectedRoadId?: string | null;
  activeTool: string;
  onSelectMesh: (id: string | null) => void;
  onSelectRoad?: (id: string | null) => void;
  onAddMesh: (mesh: FreeformZoneMesh) => void;
  onUpdateMesh: (mesh: FreeformZoneMesh) => void;
  onRemoveMesh: (id: string) => void;
  onAddRoad?: (road: SpatialRoad) => void;
  onUpdateRoad?: (road: SpatialRoad) => void;
  onRemoveRoad?: (id: string) => void;
  onGestureStart?: () => void;
  onCommitGesture?: () => void;
}

const ZONE_COLOR: Record<number, string> = {
  1: TILE_META[1].color, // Residential
  2: TILE_META[2].color, // Commercial
  3: TILE_META[3].color, // Green
  4: TILE_META[4].color, // Road
  5: TILE_META[5].color, // Industrial
  40: TILE_META[40]?.color ?? "#64748b",
  41: TILE_META[41]?.color ?? "#64748b",
  42: TILE_META[42]?.color ?? "#475569",
  43: TILE_META[43]?.color ?? "#f59e0b",
};

const ZONE_LABEL: Record<number, string> = {
  1: "Residential",
  2: "Commercial",
  3: "Park",
  4: "Road",
  5: "Industrial",
  40: "Pedestrian",
  41: "Local Road",
  42: "Avenue",
  43: "Highway",
};

interface LODState {
  cameraDistance: number;
  isZoomedIn: boolean;
}

const LODContext = createContext<LODState>({ cameraDistance: 100, isZoomedIn: false });

function isRoadMeshType(type: number): boolean {
  return type === 4 || type === 40 || type === 41 || type === 42 || type === 43;
}

/** WASD map panning + Q/E elevation controller for R3F 3D WebGL camera (Camera POV relative). */
function WASDCameraController({ orbitRef }: { orbitRef: React.RefObject<OrbitControlsImpl> }) {
  const keysPressed = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      keysPressed.current[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useFrame((state, delta) => {
    const keys = keysPressed.current;
    const controls = orbitRef.current;
    if (!controls) return;

    const moveSpeed = 45.0 * delta; // 45 meters/sec
    const camera = state.camera;

    // Calculate camera forward vector projected onto ground plane (XZ)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0.0001) forward.normalize();

    // Calculate camera right vector
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();
    if (right.lengthSq() > 0.0001) right.normalize();

    const moveVector = new THREE.Vector3();
    if (keys["w"]) moveVector.addScaledVector(forward, moveSpeed);
    if (keys["s"]) moveVector.addScaledVector(forward, -moveSpeed);
    if (keys["a"]) moveVector.addScaledVector(right, moveSpeed);
    if (keys["d"]) moveVector.addScaledVector(right, -moveSpeed);

    const moveY = (keys["q"] ? moveSpeed : 0) - (keys["e"] ? moveSpeed : 0);

    if (moveVector.lengthSq() > 0 || moveY !== 0) {
      controls.target.add(moveVector);
      controls.object.position.add(moveVector);

      if (moveY !== 0) {
        controls.object.position.y = Math.max(2.0, controls.object.position.y + moveY);
      }
      controls.update();
    }
  });

  return null;
}

/** Camera LOD tracker — updates distance state without triggering main thread React loops. */
function LODTracker({ children }: { children: (lod: LODState) => React.ReactNode }) {
  const [lod, setLod] = useState<LODState>({ cameraDistance: 80, isZoomedIn: false });
  const lastDistRef = useRef(80);

  useFrame(({ camera }) => {
    const dist = camera.position.length();
    if (Math.abs(dist - lastDistRef.current) > 2.5) {
      lastDistRef.current = dist;
      setLod({
        cameraDistance: dist,
        isZoomedIn: dist < 70,
      });
    }
  });

  return <LODContext.Provider value={lod}>{children(lod)}</LODContext.Provider>;
}

function AnimatedRoadTraffic3D({
  width,
  depth,
  isHighway,
}: {
  width: number;
  depth: number;
  isHighway: boolean;
}) {
  const lineRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (lineRef.current) {
      const mat = lineRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 + 0.45 * Math.sin(clock.getElapsedTime() * 5);
    }
  });

  const stripeWidth = Math.max(0.4, Math.min(width, depth) * 0.18);
  const isHorizontal = width >= depth;
  const stripeW = isHorizontal ? width : stripeWidth;
  const stripeD = isHorizontal ? stripeWidth : depth;

  return (
    <mesh ref={lineRef} position={[0, 0.06, 0]}>
      <boxGeometry args={[stripeW, 0.02, stripeD]} />
      <meshBasicMaterial
        color={isHighway ? "#ffd166" : "#7cffb2"}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

/** High-Detail Zone Label revealed upon zooming in */
function DetailedZoneLabel({
  mesh,
  height,
  showFullDetails,
}: {
  mesh: FreeformZoneMesh;
  height: number;
  showFullDetails: boolean;
}) {
  const isRoad = isRoadMeshType(mesh.type);
  const color = ZONE_COLOR[mesh.type] ?? "#94a3b8";

  return (
    <Html
      position={[0, height / 2 + 1.2, 0]}
      center
      distanceFactor={35}
      className="pointer-events-none select-none transition-opacity duration-300"
    >
      <div className="flex flex-col items-center rounded-lg border border-border/80 bg-card/95 px-2.5 py-1.5 font-mono shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
          <span
            className="h-2.5 w-2.5 rounded-full shadow-sm"
            style={{ backgroundColor: color }}
          />
          <span>{ZONE_LABEL[mesh.type] ?? "Structure"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mt-0.5">
          <span>{Math.round(mesh.footprint.width * mesh.footprint.depth)} m²</span>
          {showFullDetails && !isRoad && (
            <span>• {mesh.footprint.width.toFixed(1)}m × {mesh.footprint.depth.toFixed(1)}m</span>
          )}
        </div>
        {showFullDetails && (
          <div className="mt-1 flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider text-primary">
            <span>{isRoad ? "Road Segment" : `Height: ${height.toFixed(1)}m`}</span>
          </div>
        )}
      </div>
    </Html>
  );
}

interface ZoneMeshItemProps {
  mesh: FreeformZoneMesh;
  terrain?: Map<string, number>;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdateMesh: (mesh: FreeformZoneMesh) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformMode: "translate" | "rotate" | "scale";
  totalMeshCount: number;
}

function ZoneMeshItem({
  mesh,
  terrain,
  isSelected,
  onSelect,
  onUpdateMesh,
  onDraggingChange,
  transformMode,
  totalMeshCount,
}: ZoneMeshItemProps) {
  const lod = useContext(LODContext);
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const isRoad = isRoadMeshType(mesh.type);
  const baseColor = isRoad ? (ZONE_COLOR[mesh.type] ?? "#334155") : (ZONE_COLOR[mesh.type] ?? "#94a3b8");
  const customHeight = mesh.type === 3 ? 0.15 : (mesh.attributes?.height ?? (mesh.attributes?.floors ? mesh.attributes.floors * 3.0 : undefined));
  const height = isRoad
    ? 0.08
    : customHeight ??
      (mesh.type === 3
        ? 0.15
        : mesh.type === 1
          ? 4.0
          : mesh.type === 2
            ? 6.0
            : mesh.type === 5
              ? 5.0
              : 0.2);

  const elev = terrain ? (terrain.get(`${Math.round(mesh.position.x)},${Math.round(mesh.position.z)}`) ?? 0) : 0;

  // Sync mesh transform on initial selection or external update when not dragging
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(mesh.position.x, elev + height / 2, mesh.position.z);
      meshRef.current.rotation.y = (mesh.rotation * Math.PI) / 180;
      meshRef.current.scale.set(1, 1, 1);
    }
  }, [mesh.position.x, mesh.position.z, mesh.rotation, height, elev]);

  const tcRef = useRef<any>(null);

  useEffect(() => {
    const controls = tcRef.current;
    if (!controls) return;
    const handleDraggingChanged = (e: { value: boolean }) => {
      const isDragging = e.value;
      onDraggingChange(isDragging);
      if (!isDragging && meshRef.current) {
        const p = meshRef.current.position;
        const s = meshRef.current.scale;
        const rotY = (meshRef.current.rotation.y * 180) / Math.PI;

        const newWidth = Math.max(0.5, mesh.footprint.width * Math.abs(s.x));
        const newDepth = Math.max(0.5, mesh.footprint.depth * Math.abs(s.z));
        const newArea = calculatePhysicalFootprint({ width: newWidth, depth: newDepth });

        meshRef.current.scale.set(1, 1, 1);

        onUpdateMesh({
          ...mesh,
          position: { x: p.x, y: 0, z: p.z },
          rotation: rotY,
          footprint: { width: newWidth, depth: newDepth },
          area: newArea,
        });
      }
    };
    controls.addEventListener("dragging-changed", handleDraggingChanged);
    return () => controls.removeEventListener("dragging-changed", handleDraggingChanged);
  }, [mesh, onDraggingChange, onUpdateMesh]);

  // Hides DOM labels when zoomed out or for large unselected maps to maintain 60 FPS
  const showLabel =
    isSelected ||
    hovered ||
    (lod.isZoomedIn && (totalMeshCount < 60 || lod.cameraDistance < 45));

  return (
    <>
      <mesh
        ref={meshRef}
        position={[mesh.position.x, height / 2, mesh.position.z]}
        rotation={[0, (mesh.rotation * Math.PI) / 180, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(mesh.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        castShadow={!isRoad && totalMeshCount < 100}
        receiveShadow
      >
        <boxGeometry args={[mesh.footprint.width, height, mesh.footprint.depth]} />
        <meshStandardMaterial
          color={hovered ? "#cbd5e1" : baseColor}
          roughness={isRoad ? 0.9 : 0.4}
          metalness={isRoad ? 0.05 : 0.1}
          emissive={isSelected ? "#38bdf8" : "#000000"}
          emissiveIntensity={isSelected ? 0.25 : 0}
        />
        {isRoad && (
          <AnimatedRoadTraffic3D
            width={mesh.footprint.width}
            depth={mesh.footprint.depth}
            isHighway={mesh.type === 43}
          />
        )}
        {showLabel && (
          <DetailedZoneLabel
            mesh={mesh}
            height={height}
            showFullDetails={lod.isZoomedIn || isSelected}
          />
        )}
      </mesh>

      {isSelected && (
        <TransformControls
          ref={tcRef}
          object={meshRef}
          mode={transformMode}
          showX={transformMode !== "rotate"}
          showY={transformMode === "rotate"}
          showZ={transformMode !== "rotate"}
        />
      )}
    </>
  );
}

/** Instanced batch rendering for large map regions (100s of background buildings) */
function InstancedZoneGroup({
  type,
  meshes,
  selectedMeshId,
  onSelectMesh,
}: {
  type: number;
  meshes: FreeformZoneMesh[];
  selectedMeshId: string | null;
  onSelectMesh: (id: string | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const baseColor = ZONE_COLOR[type] ?? "#94a3b8";
  const isRoad = isRoadMeshType(type);
  const height = isRoad
    ? 0.08
    : type === 3
      ? 0.4
      : type === 1
        ? 4.0
        : type === 2
          ? 6.0
          : type === 5
            ? 5.0
            : 0.2;

  const groupMeshes = useMemo(
    () => meshes.filter((m) => m.id !== selectedMeshId),
    [meshes, selectedMeshId]
  );

  useEffect(() => {
    if (!meshRef.current || groupMeshes.length === 0) return;
    const dummy = new THREE.Object3D();
    groupMeshes.forEach((m, idx) => {
      dummy.position.set(m.position.x, height / 2, m.position.z);
      dummy.rotation.set(0, (m.rotation * Math.PI) / 180, 0);
      dummy.scale.set(m.footprint.width, height, m.footprint.depth);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(idx, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [groupMeshes, height]);

  if (groupMeshes.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, groupMeshes.length]}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && groupMeshes[e.instanceId]) {
          onSelectMesh(groupMeshes[e.instanceId].id);
        }
      }}
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={baseColor}
        roughness={isRoad ? 0.9 : 0.4}
        metalness={isRoad ? 0.05 : 0.1}
      />
    </instancedMesh>
  );
}

function SpatialRoad3DItem({
  road,
  terrain,
  isSelected,
  onSelect,
  viewCutawayLevel,
}: {
  road: SpatialRoad;
  terrain?: Map<string, number>;
  isSelected: boolean;
  onSelect?: (id: string) => void;
  viewCutawayLevel?: number | null;
}) {
  if (!road.points || road.points.length < 2) return null;
  const level = getRoadLevel(road);
  const color = ZONE_COLOR[road.type] ?? "#64748b";
  const isElevated = level > 0 || (road.elevation !== undefined && road.elevation > 1.0);
  const isTunnel = level < 0 || (road.elevation !== undefined && road.elevation < -1.0);

  // If viewCutawayLevel is active, filter out roads above the specified level
  if (viewCutawayLevel !== null && viewCutawayLevel !== undefined) {
    if (viewCutawayLevel < 0 && !isTunnel) {
      return null;
    }
    if (viewCutawayLevel === 0 && isElevated) {
      return null;
    }
    if (level > viewCutawayLevel && (road.elevation === undefined || road.elevation > viewCutawayLevel * 6.0 + 1.0)) {
      return null;
    }
  }

  const isSubterraneanMode = viewCutawayLevel !== null && viewCutawayLevel !== undefined && viewCutawayLevel < 0;

  // Compute road segments with 3D elevation, pitch, and pillars
  return (
    <group onClick={(e) => { e.stopPropagation(); onSelect?.(road.id); }}>
      {road.points.slice(0, -1).map((pt1, i) => {
        const pt2 = road.points[i + 1];
        const dx = pt2.x - pt1.x;
        const dz = pt2.y - pt1.y;
        const len = Math.hypot(dx, dz);
        if (len === 0) return null;

        const terr1 = terrain ? (terrain.get(`${Math.round(pt1.x)},${Math.round(pt1.y)}`) ?? 0) : 0;
        const terr2 = terrain ? (terrain.get(`${Math.round(pt2.x)},${Math.round(pt2.y)}`) ?? 0) : 0;
        const elev1 = getRoadPointElevation(road, i, terr1);
        const elev2 = getRoadPointElevation(road, i + 1, terr2);

        // Segment-level cutaway filtering for ramps
        if (viewCutawayLevel !== null && viewCutawayLevel !== undefined) {
          const segMaxElev = Math.max(elev1, elev2);
          const limitMeters = viewCutawayLevel * 6.0 + 1.0;
          if (viewCutawayLevel < 0 && segMaxElev > -0.5) return null;
          if (viewCutawayLevel >= 0 && segMaxElev > limitMeters) return null;
        }

        const midX = (pt1.x + pt2.x) / 2;
        const midZ = (pt1.y + pt2.y) / 2;
        const midY = (elev1 + elev2) / 2 + 0.04;

        const rotY = -Math.atan2(dz, dx);
        const dy = elev2 - elev1;
        const rotZ = Math.atan2(dy, len);

        // Support pillar calculation along the segment
        const pillarTValues = len > 28 ? [0.25, 0.5, 0.75] : len > 14 ? [0.33, 0.67] : [0.5];
        const pillars = isElevated && !isSubterraneanMode
          ? pillarTValues.map((t, pIdx) => {
              const px = pt1.x + t * dx;
              const pz = pt1.y + t * dz;
              const deckY = elev1 + t * dy;
              const groundY = terrain ? (terrain.get(`${Math.round(px)},${Math.round(pz)}`) ?? 0) : 0;
              const height = deckY - groundY;
              return { key: pIdx, px, pz, groundY, height };
            }).filter((p) => p.height > 0.8)
          : [];

        return (
          <group key={i}>
            {/* Main Road Deck Segment with Sloped Pitch */}
            <group position={[midX, midY, midZ]} rotation={[0, rotY, rotZ]}>
              <mesh receiveShadow={!isSubterraneanMode} castShadow={!isSubterraneanMode}>
                <boxGeometry args={[len, isElevated ? 0.22 : 0.08, road.width]} />
                <meshStandardMaterial
                  color={isSelected ? "#ffd166" : isTunnel ? (isSubterraneanMode ? "#6366f1" : "#1e1b4b") : color}
                  emissive={isSubterraneanMode && isTunnel ? "#818cf8" : isSelected ? "#f59e0b" : "#000000"}
                  emissiveIntensity={isSubterraneanMode && isTunnel ? 0.7 : isSelected ? 0.2 : 0}
                  roughness={isElevated ? 0.75 : 0.6}
                  metalness={isElevated ? 0.15 : 0.05}
                />
              </mesh>

              {/* Elevated Bridge Parapets / Guardrails */}
              {isElevated && (
                <>
                  <mesh position={[0, 0.22, road.width / 2]} receiveShadow castShadow>
                    <boxGeometry args={[len, 0.35, 0.16]} />
                    <meshStandardMaterial color="#475569" roughness={0.5} />
                  </mesh>
                  <mesh position={[0, 0.22, -road.width / 2]} receiveShadow castShadow>
                    <boxGeometry args={[len, 0.35, 0.16]} />
                    <meshStandardMaterial color="#475569" roughness={0.5} />
                  </mesh>
                </>
              )}

              {/* Subterranean Tunnel Guide Lights */}
              {isTunnel && (
                <>
                  <mesh position={[0, 0.08, road.width / 2 - 0.2]}>
                    <boxGeometry args={[len, isSubterraneanMode ? 0.1 : 0.04, 0.1]} />
                    <meshBasicMaterial color={isSubterraneanMode ? "#c084fc" : "#a855f7"} />
                  </mesh>
                  <mesh position={[0, 0.08, -road.width / 2 + 0.2]}>
                    <boxGeometry args={[len, isSubterraneanMode ? 0.1 : 0.04, 0.1]} />
                    <meshBasicMaterial color={isSubterraneanMode ? "#c084fc" : "#a855f7"} />
                  </mesh>
                </>
              )}

              {/* Animated Traffic Flows */}
              <AnimatedRoadTraffic3D
                width={len}
                depth={road.width}
                isHighway={road.type === 43}
              />
            </group>

            {/* Elevated Structural Concrete Support Pillars / Piers */}
            {pillars.map((p) => (
              <group key={p.key} position={[p.px, p.groundY + p.height / 2, p.pz]}>
                {/* Vertical Column */}
                <mesh castShadow receiveShadow>
                  <cylinderGeometry args={[Math.min(1.2, road.width * 0.18), Math.min(1.5, road.width * 0.22), p.height, 12]} />
                  <meshStandardMaterial color="#334155" roughness={0.85} metalness={0.1} />
                </mesh>
                {/* Horizontal Crossbeam Pier Head */}
                <mesh position={[0, p.height / 2 - 0.15, 0]} rotation={[0, rotY, 0]} castShadow>
                  <boxGeometry args={[1.4, 0.3, road.width * 0.95]} />
                  <meshStandardMaterial color="#1e293b" roughness={0.8} />
                </mesh>
              </group>
            ))}

            {/* Selection / Level 3D Callout Indicator */}
            {isSelected && i === Math.floor((road.points.length - 1) / 2) && (
              <Html position={[midX, midY + (isElevated ? 2.2 : 1.4), midZ]} center distanceFactor={40}>
                <div className="flex flex-col items-center rounded-md border border-amber-400 bg-slate-950/90 px-2 py-1 font-mono text-[10px] text-amber-300 shadow-2xl backdrop-blur-md pointer-events-none">
                  <span className="font-bold">
                    {road.isRamp ? `RAMP [L${road.startLevel ?? 0} → L${road.endLevel ?? 1}]` : LEVEL_SHORT_BADGES[level]}
                  </span>
                  <span className="text-[9px] text-slate-300">
                    {midY >= 0 ? `+${midY.toFixed(1)}m` : `${midY.toFixed(1)}m`} • {road.width}m width
                  </span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** 3D Terrain Grid Plane that physically displaces vertices and contours with elevation changes */
function ElevatedTerrainGround({
  terrain,
  size = 600,
  onClick,
  isSubterranean = false,
}: {
  terrain?: Map<string, number>;
  size?: number;
  onClick: (e: { point: THREE.Vector3; stopPropagation: () => void; nativeEvent?: MouseEvent }) => void;
  isSubterranean?: boolean;
}) {
  const segments = Math.min(250, Math.max(100, Math.floor(size / 4)));

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, segments, segments);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [size, segments]);

  const terrainEntries = useMemo(() => {
    return terrain ? Array.from(terrain.entries()) : [];
  }, [terrain]);

  useEffect(() => {
    if (!geom) return;
    const pos = geom.attributes.position;
    const count = pos.count;
    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const gx = Math.round(vx);
      const gz = Math.round(vz);
      let elev = 0;
      if (terrain && terrain.size > 0) {
        const direct = terrain.get(`${gx},${gz}`);
        if (direct !== undefined) {
          elev = direct;
        } else {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              const val = terrain.get(`${gx + dx},${gz + dz}`);
              if (val !== undefined && val > 0) {
                const dist = Math.hypot(vx - (gx + dx), vz - (gz + dz));
                if (dist < 1.4) {
                  elev = Math.max(elev, val * (1 - dist / 1.4));
                }
              }
            }
          }
        }
      }
      pos.setY(i, elev);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }, [geom, terrainEntries, terrain]);

  return (
    <group>
      {/* 1. Solid Ground Mesh or Subterranean Translucent X-Ray Plane */}
      <mesh
        geometry={geom}
        position={[0, 0, 0]}
        onClick={onClick}
        receiveShadow={!isSubterranean}
      >
        <meshStandardMaterial
          color={isSubterranean ? "#1e1b4b" : "#0f172a"}
          roughness={0.88}
          metalness={0.12}
          flatShading={false}
          transparent={isSubterranean}
          opacity={isSubterranean ? 0.08 : 1.0}
          depthWrite={!isSubterranean}
        />
      </mesh>

      {/* 2. Elevated Wireframe Grid lines conforming to the raised terrain */}
      <mesh
        geometry={geom}
        position={[0, 0.03, 0]}
      >
        <meshBasicMaterial
          color={isSubterranean ? "#c084fc" : "#38bdf8"}
          wireframe
          transparent
          opacity={isSubterranean ? 0.28 : 0.18}
        />
      </mesh>

      {/* Outer buffer plane */}
      {!isSubterranean && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.05, 0]}
          onClick={onClick}
          receiveShadow
        >
          <planeGeometry args={[Math.max(2500, size * 3), Math.max(2500, size * 3)]} />
          <meshStandardMaterial color="#080e1a" roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

export function FreeformCanvas3D({
  meshes,
  roads = [],
  terrain,
  terrainMode,
  terrainRadius,
  terrainStrength,
  onEditTerrain,
  selectedMeshId,
  selectedRoadId,
  activeTool,
  onSelectMesh,
  onSelectRoad,
  onAddMesh,
  onUpdateMesh,
  onRemoveMesh,
  onAddRoad,
  onRemoveRoad,
  onGestureStart,
  onCommitGesture,
}: FreeformCanvas3DProps) {
  const orbitRef = useRef<OrbitControlsImpl>(null!);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [hideZones, setHideZones] = useState(false);
  const [viewCutawayLevel, setViewCutawayLevel] = useState<number | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Handle keyboard shortcuts for delete (avoid conflicting with WASD/tool shortcuts)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedRoadId) {
          onRemoveRoad?.(selectedRoadId);
          onSelectRoad?.(null);
        } else if (selectedMeshId) {
          onRemoveMesh(selectedMeshId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMeshId, selectedRoadId, onRemoveMesh, onRemoveRoad, onSelectRoad]);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleGroundClick = (e: { point: THREE.Vector3; stopPropagation: () => void; nativeEvent?: MouseEvent }) => {
    e.stopPropagation();
    if (activeTool === "select") {
      onSelectMesh(null);
      onSelectRoad?.(null);
      return;
    }

    // Accessibility check: only add zone / road / edit terrain on a clean click, not camera orbit drag
    if (pointerDownPosRef.current && e.nativeEvent) {
      const dist = Math.hypot(
        e.nativeEvent.clientX - pointerDownPosRef.current.x,
        e.nativeEvent.clientY - pointerDownPosRef.current.y
      );
      if (dist > 5) return; // User was dragging/orbiting the camera
    }

    // Terrain editing tool in 3D
    if (activeTool.startsWith("terrain_")) {
      const mode = (terrainMode ?? activeTool.replace("terrain_", "")) as import("../../types/spatial").TerrainEditMode;
      onEditTerrain?.(
        { x: e.point.x, y: e.point.z },
        mode,
        terrainRadius ?? 2,
        terrainStrength ?? 1.0
      );
      return;
    }

    const typeMap: Record<string, number> = {
      residential: 1,
      commercial: 2,
      green: 3,
      industrial: 5,
      road: 41,
      road_local: 41,
      road_transit: 42,
      road_highway: 43,
    };
    const zoneType = typeMap[activeTool] ?? 1;
    const isRoad = isRoadMeshType(zoneType);

    if (isRoad) {
      const roadSubtype = (zoneType as RoadSubtype);
      const clickX = Math.round(e.point.x * 10) / 10;
      const clickZ = Math.round(e.point.z * 10) / 10;
      const roadWidth = getDefaultRoadWidth(roadSubtype);

      const newRoad: SpatialRoad = {
        id: `road_${Date.now()}`,
        type: roadSubtype,
        points: [
          { x: clickX - 10, y: clickZ },
          { x: clickX + 10, y: clickZ },
        ],
        width: roadWidth,
        level: 0,
        elevation: 0,
      };

      onAddRoad?.(newRoad);
      onSelectRoad?.(newRoad.id);
      onSelectMesh(null);
      return;
    }

    const newMesh: FreeformZoneMesh = {
      id: `mesh_freeform_${Date.now()}`,
      type: zoneType,
      position: { x: Math.round(e.point.x * 10) / 10, y: 0, z: Math.round(e.point.z * 10) / 10 },
      rotation: 0,
      footprint: { width: 10, depth: 10 },
      area: 100,
    };

    onAddMesh(newMesh);
  };

  // Calculate dynamic grid size to expand as objects/roads/terrain reach edges
  const dynamicGridSize = useMemo(() => {
    let maxExtent = 150;
    for (const m of meshes) {
      const halfW = (m.footprint?.width || 10) / 2;
      const halfD = (m.footprint?.depth || 10) / 2;
      maxExtent = Math.max(maxExtent, Math.abs(m.position.x) + halfW, Math.abs(m.position.z) + halfD);
    }
    for (const r of roads) {
      for (const p of r.points) {
        maxExtent = Math.max(maxExtent, Math.abs(p.x), Math.abs(p.y));
      }
    }
    if (terrain && terrain.size > 0) {
      for (const key of terrain.keys()) {
        const [x, z] = key.split(",").map(Number);
        if (!isNaN(x) && !isNaN(z)) {
          maxExtent = Math.max(maxExtent, Math.abs(x), Math.abs(z));
        }
      }
    }
    const neededExtent = maxExtent + 80;
    const neededSize = neededExtent * 2;
    return Math.max(600, Math.ceil(neededSize / 100) * 100);
  }, [meshes, roads, terrain]);

  // Group meshes by type for instanced rendering when mesh count is large
  const isLargeMap = meshes.length > 80;
  const typesPresent = useMemo(() => Array.from(new Set(meshes.map((m) => m.type))), [meshes]);
  const isSubterraneanMode = viewCutawayLevel !== null && viewCutawayLevel < 0;
  const hideBuildingZones = hideZones || isSubterraneanMode;

  return (
    <div className="relative h-full w-full bg-[#0b1120] overflow-hidden select-none">
      {/* Viewport Toolbar Controls & Controls Guide */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border/80 bg-card/90 p-1.5 shadow-xl backdrop-blur">
        <span className="px-2 font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Transform Mode
        </span>
        <button
          type="button"
          onClick={() => setTransformMode("translate")}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            transformMode === "translate"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
        >
          Translate (T)
        </button>
        <button
          type="button"
          onClick={() => setTransformMode("rotate")}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            transformMode === "rotate"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
        >
          Rotate Y (R)
        </button>
        <button
          type="button"
          onClick={() => setTransformMode("scale")}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            transformMode === "scale"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
        >
          Resize XZ (S)
        </button>

        <div className="mx-1 h-4 w-[1px] bg-border" />

        {/* Level Cutaway View Controls (View Under Map / Hide Above Level) */}
        <div className="flex items-center gap-1 rounded bg-secondary/80 p-0.5">
          <Layers className="size-3.5 text-muted-foreground ml-1" />
          <button
            type="button"
            onClick={() => setViewCutawayLevel(null)}
            className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
              viewCutawayLevel === null
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Show all elevation levels (flyovers, surface, and subterranean)"
          >
            All Levels
          </button>
          <button
            type="button"
            onClick={() => setViewCutawayLevel(0)}
            className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
              viewCutawayLevel === 0
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Hide elevated bridges and flyovers to inspect surface & ground level"
          >
            L0 & Below
          </button>
          <button
            type="button"
            onClick={() => setViewCutawayLevel(-1)}
            className={`flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold transition-colors ${
              viewCutawayLevel === -1
                ? "bg-metro-blue text-slate-950 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="View under the map: hides surface structures and turns ground transparent to view subterranean tunnels & underpasses"
          >
            <ArrowDownToLine className="size-3" />
            <span>Subterranean (View Under Map)</span>
          </button>
        </div>

        <div className="mx-1 h-4 w-[1px] bg-border" />

        <button
          type="button"
          onClick={() => setHideZones((h) => !h)}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            hideZones
              ? "bg-amber-500/25 text-amber-300 border border-amber-500/40"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
          title="Toggle hiding zones to view street and traffic flow layout"
        >
          {hideZones ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          <span>{hideZones ? "Zones Hidden (Street View)" : "Hide Zones"}</span>
        </button>
      </div>

      <div className="absolute left-3 bottom-3 z-10 flex items-center gap-2 rounded-md border border-border/70 bg-card/85 px-2.5 py-1 font-mono text-[10px] text-muted-foreground shadow-md backdrop-blur">
        <Compass className="size-3 text-primary animate-spin-slow" />
        <span>WASD: Pan Map • Q/E: Elevate Up/Down</span>
      </div>

      {hideZones && !isSubterraneanMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/80 px-4 py-1 font-mono text-xs font-semibold text-amber-300 shadow-xl backdrop-blur-md">
          <EyeOff className="size-3.5 animate-pulse" />
          <span>Zones Hidden • Street Layout & Traffic Flow View Active</span>
        </div>
      )}

      {isSubterraneanMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full border border-metro-blue/50 bg-slate-950/90 px-4 py-1.5 font-mono text-xs font-semibold text-metro-blue shadow-2xl backdrop-blur-md">
          <ArrowDownToLine className="size-3.5 text-metro-blue animate-bounce" />
          <span>Subterranean View Active • Underpasses & Tunnels Visible Under Map</span>
          <button
            type="button"
            onClick={() => setViewCutawayLevel(null)}
            className="ml-2 rounded bg-metro-blue/20 px-2 py-0.5 text-[10px] font-bold text-metro-blue hover:bg-metro-blue/30 transition-colors"
          >
            Reset to All
          </button>
        </div>
      )}

      {viewCutawayLevel === 0 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full border border-blue-500/50 bg-slate-900/90 px-4 py-1.5 font-mono text-xs font-semibold text-blue-200 shadow-2xl backdrop-blur-md">
          <Layers className="size-3.5 text-blue-400" />
          <span>Surface Cutaway Active • Elevated Flyovers Hidden</span>
          <button
            type="button"
            onClick={() => setViewCutawayLevel(null)}
            className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Reset
          </button>
        </div>
      )}

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border/80 bg-card/90 px-3 py-1.5 font-mono text-xs font-semibold text-foreground shadow-xl backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>{meshes.length} Zones</span>
        {roads.length > 0 && <span className="text-muted-foreground">• {roads.length} Roads</span>}
      </div>

      <Canvas
        camera={{ position: [0, 40, 50], fov: 45 }}
        shadows={!isLargeMap && !isSubterraneanMode}
        onPointerDown={(e) => {
          handlePointerDown(e);
          if (e.target === e.currentTarget) {
            onSelectMesh(null);
            onSelectRoad?.(null);
          }
        }}
      >
        <LODTracker>
          {() => (
            <>
              <WASDCameraController orbitRef={orbitRef} />
              <ambientLight intensity={isSubterraneanMode ? 0.9 : 0.7} />
              <directionalLight
                position={[50, 80, 40]}
                intensity={1.2}
                castShadow={!isLargeMap && !isSubterraneanMode}
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
              />
              <gridHelper
                args={[dynamicGridSize, Math.floor(dynamicGridSize / 5), isSubterraneanMode ? "#a855f7" : "#38bdf8", "#1e293b"]}
                position={[0, 0, 0]}
              />

              {/* Dynamically elevated terrain ground and contour grid */}
              <ElevatedTerrainGround
                terrain={terrain}
                size={dynamicGridSize}
                onClick={handleGroundClick}
                isSubterranean={isSubterraneanMode}
              />

              {/* 3D Freeform Multi-segment Roads (Filtered by viewCutawayLevel) */}
              {roads.map((road) => (
                <SpatialRoad3DItem
                  key={road.id}
                  road={road}
                  terrain={terrain}
                  isSelected={road.id === selectedRoadId}
                  onSelect={onSelectRoad}
                  viewCutawayLevel={viewCutawayLevel}
                />
              ))}

              {/* 3D Zone Meshes (Hidden when hideZones or Subterranean View is active) */}
              {!hideBuildingZones && (
                isLargeMap ? (
                  <>
                    {typesPresent.map((t) => (
                      <InstancedZoneGroup
                        key={t}
                        type={t}
                        meshes={meshes}
                        selectedMeshId={selectedMeshId}
                        onSelectMesh={onSelectMesh}
                      />
                    ))}
                    {/* Selected Mesh is rendered with full TransformControls & LOD Label */}
                    {selectedMeshId && (
                      <ZoneMeshItem
                        mesh={meshes.find((m) => m.id === selectedMeshId)!}
                        terrain={terrain}
                        isSelected={true}
                        onSelect={onSelectMesh}
                        onUpdateMesh={onUpdateMesh}
                        onDraggingChange={(dragging) => {
                          if (orbitRef.current) orbitRef.current.enabled = !dragging;
                          if (dragging) onGestureStart?.();
                          else onCommitGesture?.();
                        }}
                        transformMode={transformMode}
                        totalMeshCount={meshes.length}
                      />
                    )}
                  </>
                ) : (
                  /* Standard rendering for regular cities */
                  meshes.map((mesh) => (
                    <ZoneMeshItem
                      key={mesh.id}
                      mesh={mesh}
                      terrain={terrain}
                      isSelected={mesh.id === selectedMeshId}
                      onSelect={onSelectMesh}
                      onUpdateMesh={onUpdateMesh}
                      onDraggingChange={(dragging) => {
                        if (orbitRef.current) orbitRef.current.enabled = !dragging;
                        if (dragging) onGestureStart?.();
                        else onCommitGesture?.();
                      }}
                      transformMode={transformMode}
                      totalMeshCount={meshes.length}
                    />
                  ))
                )
              )}

              <OrbitControls
                ref={orbitRef}
                makeDefault
                minDistance={5}
                maxDistance={350}
                maxPolarAngle={isSubterraneanMode ? Math.PI - 0.05 : Math.PI / 2 - 0.05}
              />
            </>
          )}
        </LODTracker>
      </Canvas>
    </div>
  );
}

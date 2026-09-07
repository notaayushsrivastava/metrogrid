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
import { Eye, EyeOff, Compass } from "lucide-react";
import type { FreeformZoneMesh } from "../../utils/freeform";
import { calculatePhysicalFootprint } from "../../utils/freeform";
import type { SpatialRoad } from "../../types/spatial";
import { TILE_META } from "../../config/tiles";

interface FreeformCanvas3DProps {
  meshes: FreeformZoneMesh[];
  roads?: SpatialRoad[];
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

/** WASD map panning + Q/E elevation controller for R3F 3D WebGL camera. */
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

  useFrame((_, delta) => {
    const keys = keysPressed.current;
    const moveSpeed = 45.0 * delta; // 45 meters/sec
    const moveX = (keys["d"] ? moveSpeed : 0) - (keys["a"] ? moveSpeed : 0);
    const moveZ = (keys["s"] ? moveSpeed : 0) - (keys["w"] ? moveSpeed : 0);
    const moveY = (keys["q"] ? moveSpeed : 0) - (keys["e"] ? moveSpeed : 0);

    if (moveX !== 0 || moveZ !== 0 || moveY !== 0) {
      const controls = orbitRef.current;
      if (controls) {
        controls.target.x += moveX;
        controls.target.z += moveZ;
        controls.target.y = Math.max(0, controls.target.y);

        controls.object.position.x += moveX;
        controls.object.position.z += moveZ;
        controls.object.position.y = Math.max(2.0, controls.object.position.y + moveY);

        controls.update();
      }
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
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdateMesh: (mesh: FreeformZoneMesh) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformMode: "translate" | "rotate" | "scale";
  totalMeshCount: number;
}

function ZoneMeshItem({
  mesh,
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
  const customHeight = mesh.attributes?.height ?? (mesh.attributes?.floors ? mesh.attributes.floors * 3.0 : undefined);
  const height = isRoad
    ? 0.08
    : customHeight ??
      (mesh.type === 3
        ? 0.4
        : mesh.type === 1
          ? 4.0
          : mesh.type === 2
            ? 6.0
            : mesh.type === 5
              ? 5.0
              : 0.2);

  // Sync mesh transform on initial selection or external update when not dragging
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(mesh.position.x, height / 2, mesh.position.z);
      meshRef.current.rotation.y = (mesh.rotation * Math.PI) / 180;
      meshRef.current.scale.set(1, 1, 1);
    }
  }, [mesh.position.x, mesh.position.z, mesh.rotation, height]);

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
  isSelected,
  onSelect,
}: {
  road: SpatialRoad;
  isSelected: boolean;
  onSelect?: (id: string) => void;
}) {
  if (!road.points || road.points.length < 2) return null;
  const color = ZONE_COLOR[road.type] ?? "#64748b";

  return (
    <group onClick={(e) => { e.stopPropagation(); onSelect?.(road.id); }}>
      {road.points.slice(0, -1).map((pt1, i) => {
        const pt2 = road.points[i + 1];
        const dx = pt2.x - pt1.x;
        const dz = pt2.y - pt1.y;
        const len = Math.hypot(dx, dz);
        if (len === 0) return null;

        const midX = (pt1.x + pt2.x) / 2;
        const midZ = (pt1.y + pt2.y) / 2;
        const rotY = -Math.atan2(dz, dx);

        return (
          <group key={i} position={[midX, 0.04, midZ]} rotation={[0, rotY, 0]}>
            <mesh receiveShadow castShadow>
              <boxGeometry args={[len, 0.08, road.width]} />
              <meshStandardMaterial
                color={isSelected ? "#ffd166" : color}
                roughness={0.6}
              />
            </mesh>
            <AnimatedRoadTraffic3D
              width={len}
              depth={road.width}
              isHighway={road.type === 43}
            />
          </group>
        );
      })}
    </group>
  );
}

export function FreeformCanvas3D({
  meshes,
  roads = [],
  selectedMeshId,
  selectedRoadId,
  activeTool,
  onSelectMesh,
  onSelectRoad,
  onAddMesh,
  onUpdateMesh,
  onRemoveMesh,
  onGestureStart,
  onCommitGesture,
}: FreeformCanvas3DProps) {
  const orbitRef = useRef<OrbitControlsImpl>(null!);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [hideZones, setHideZones] = useState(false);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Handle keyboard shortcuts for TransformControls mode & delete
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === "t" || e.key === "T") setTransformMode("translate");
      if (e.key === "r" || e.key === "R") setTransformMode("rotate");
      if (e.key === "s" || e.key === "S") setTransformMode("scale");
      if ((e.key === "Delete" || e.key === "Backspace") && selectedMeshId) {
        onRemoveMesh(selectedMeshId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMeshId, onRemoveMesh]);

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

    // Accessibility check: only add zone on a clean click, not camera orbit drag
    if (pointerDownPosRef.current && e.nativeEvent) {
      const dist = Math.hypot(
        e.nativeEvent.clientX - pointerDownPosRef.current.x,
        e.nativeEvent.clientY - pointerDownPosRef.current.y
      );
      if (dist > 5) return; // User was dragging/orbiting the camera
    }

    const typeMap: Record<string, number> = {
      residential: 1,
      commercial: 2,
      green: 3,
      industrial: 5,
      road: 4,
      road_local: 41,
      road_transit: 42,
      road_highway: 43,
    };
    const zoneType = typeMap[activeTool] ?? 1;
    const isRoad = isRoadMeshType(zoneType);

    const newMesh: FreeformZoneMesh = {
      id: `mesh_freeform_${Date.now()}`,
      type: zoneType,
      position: { x: Math.round(e.point.x * 10) / 10, y: 0, z: Math.round(e.point.z * 10) / 10 },
      rotation: 0,
      footprint: isRoad ? { width: 20, depth: 6 } : { width: 10, depth: 10 },
      area: isRoad ? 120 : 100,
    };

    onAddMesh(newMesh);
  };

  // Group meshes by type for instanced rendering when mesh count is large
  const isLargeMap = meshes.length > 80;
  const typesPresent = useMemo(() => Array.from(new Set(meshes.map((m) => m.type))), [meshes]);

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

      {hideZones && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/80 px-4 py-1 font-mono text-xs font-semibold text-amber-300 shadow-xl backdrop-blur-md">
          <EyeOff className="size-3.5 animate-pulse" />
          <span>Zones Hidden • Street Layout & Traffic Flow View Active</span>
        </div>
      )}

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border/80 bg-card/90 px-3 py-1.5 font-mono text-xs font-semibold text-foreground shadow-xl backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>{meshes.length} Zones</span>
        {roads.length > 0 && <span className="text-muted-foreground">• {roads.length} Roads</span>}
      </div>

      <Canvas
        camera={{ position: [0, 40, 50], fov: 45 }}
        shadows={!isLargeMap}
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
              <ambientLight intensity={0.7} />
              <directionalLight
                position={[50, 80, 40]}
                intensity={1.2}
                castShadow={!isLargeMap}
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
              />
              <gridHelper args={[600, 120, "#38bdf8", "#1e293b"]} position={[0, 0, 0]} />

              {/* Ground Plane */}
              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, -0.01, 0]}
                onClick={handleGroundClick}
                receiveShadow
              >
                <planeGeometry args={[1200, 1200]} />
                <meshStandardMaterial color="#0f172a" roughness={0.9} />
              </mesh>

              {/* 3D Freeform Multi-segment Roads (Preserved & Animating Always) */}
              {roads.map((road) => (
                <SpatialRoad3DItem
                  key={road.id}
                  road={road}
                  isSelected={road.id === selectedRoadId}
                  onSelect={onSelectRoad}
                />
              ))}

              {/* 3D Zone Meshes (Hidden when hideZones is active) */}
              {!hideZones && (
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
                maxPolarAngle={Math.PI / 2 - 0.05}
              />
            </>
          )}
        </LODTracker>
      </Canvas>
    </div>
  );
}

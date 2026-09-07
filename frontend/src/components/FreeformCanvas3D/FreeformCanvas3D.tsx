/**
 * FreeformCanvas3D — 3D WebGL Spatial Canvas (PRD Phase 5).
 * 1 WebGL unit = 1 meter.
 *
 * Provides unconstrained spatial placement and continuous translation/resizing
 * of 3D zone meshes using @react-three/drei's TransformControls.
 * Protects against React state loops during dragging and isolates UI dialogs.
 */

import { useState, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, TransformControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FreeformZoneMesh } from "../../utils/freeform";
import { calculatePhysicalFootprint } from "../../utils/freeform";
import { TILE_META } from "../../config/tiles";

interface FreeformCanvas3DProps {
  meshes: FreeformZoneMesh[];
  selectedMeshId: string | null;
  activeTool: string;
  onSelectMesh: (id: string | null) => void;
  onAddMesh: (mesh: FreeformZoneMesh) => void;
  onUpdateMesh: (mesh: FreeformZoneMesh) => void;
  onRemoveMesh: (id: string) => void;
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

interface ZoneMeshItemProps {
  mesh: FreeformZoneMesh;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdateMesh: (mesh: FreeformZoneMesh) => void;
  onDraggingChange: (dragging: boolean) => void;
  transformMode: "translate" | "scale";
}

function isRoadMeshType(type: number): boolean {
  return type === 4 || type === 40 || type === 41 || type === 42 || type === 43;
}

function ZoneMeshItem({
  mesh,
  isSelected,
  onSelect,
  onUpdateMesh,
  onDraggingChange,
  transformMode,
}: ZoneMeshItemProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const baseColor = ZONE_COLOR[mesh.type] ?? "#94a3b8";
  const height = mesh.type === 3 ? 0.4 : mesh.type === 1 ? 4.0 : mesh.type === 2 ? 6.0 : mesh.type === 5 ? 5.0 : 0.2;
  const isRoad = isRoadMeshType(mesh.type);
  const baseColor = isRoad ? (ZONE_COLOR[mesh.type] ?? "#334155") : (ZONE_COLOR[mesh.type] ?? "#94a3b8");
  const height = isRoad
    ? 0.08
    : mesh.type === 3
      ? 0.4
      : mesh.type === 1
        ? 4.0
        : mesh.type === 2
          ? 6.0
          : mesh.type === 5
            ? 5.0
            : 0.2;

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
        castShadow
        castShadow={!isRoad}
        receiveShadow
      >
        <boxGeometry args={[mesh.footprint.width, height, mesh.footprint.depth]} />
        <meshStandardMaterial
          color={hovered ? "#cbd5e1" : baseColor}
          roughness={0.4}
          metalness={0.1}
          roughness={isRoad ? 0.9 : 0.4}
          metalness={isRoad ? 0.05 : 0.1}
          emissive={isSelected ? "#38bdf8" : "#000000"}
          emissiveIntensity={isSelected ? 0.25 : 0}
        />
        <Html
          position={[0, height / 2 + 1.2, 0]}
          center
          distanceFactor={30}
          className="pointer-events-none select-none"
        >
          <div className="flex flex-col items-center rounded-md border border-border/80 bg-card/90 px-2 py-1 font-mono text-[11px] font-semibold text-foreground shadow-md backdrop-blur">
            <span>{ZONE_LABEL[mesh.type] ?? "Zone"}</span>
            <span>{ZONE_LABEL[mesh.type] ?? "Road"}</span>
            <span className="text-[9px] text-muted-foreground">
              {Math.round(mesh.footprint.width * mesh.footprint.depth)} m²
            </span>
          </div>
        </Html>
      </mesh>

      {isSelected && (
        <TransformControls
          ref={tcRef}
          object={meshRef}
          mode={transformMode}
          showY={false}
        />
      )}
    </>
  );
}

export function FreeformCanvas3D({
  meshes,
  selectedMeshId,
  activeTool,
  onSelectMesh,
  onAddMesh,
  onUpdateMesh,
  onRemoveMesh,
  onGestureStart,
  onCommitGesture,
}: FreeformCanvas3DProps) {
  const orbitRef = useRef<OrbitControlsImpl>(null!);
  const [transformMode, setTransformMode] = useState<"translate" | "scale">("translate");

  // Handle keyboard shortcuts for TransformControls mode & delete
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === "t" || e.key === "T") setTransformMode("translate");
      if (e.key === "s" || e.key === "S") setTransformMode("scale");
      if ((e.key === "Delete" || e.key === "Backspace") && selectedMeshId) {
        onRemoveMesh(selectedMeshId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMeshId, onRemoveMesh]);

  const handleGroundClick = (e: { point: THREE.Vector3; stopPropagation: () => void }) => {
    e.stopPropagation();
    if (activeTool === "select") {
      onSelectMesh(null);
      return;
    }

    // Determine zone type from active tool (default 1 = Residential)
    // Determine zone / road type from active tool (default 1 = Residential)
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
      footprint: { width: 10, depth: 10 }, // Default 10m x 10m real-world meter footprint
      area: 100,
      footprint: isRoad ? { width: 20, depth: 6 } : { width: 10, depth: 10 }, // 20m x 6m road ribbon or 10x10 footprint
      area: isRoad ? 120 : 100,
    };

    onAddMesh(newMesh);
  };

  return (
    <div className="relative h-full w-full bg-[#0b1120] overflow-hidden select-none">
      {/* Viewport Toolbar Controls */}
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
          onClick={() => setTransformMode("scale")}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            transformMode === "scale"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
        >
          Resize XZ (S)
        </button>
      </div>

      <Canvas
        camera={{ position: [0, 40, 50], fov: 45 }}
        shadows
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSelectMesh(null);
        }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[50, 80, 40]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <gridHelper args={[500, 100, "#38bdf8", "#1e293b"]} position={[0, 0, 0]} />

        {/* Clickable Ground Plane */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          onClick={handleGroundClick}
          receiveShadow
        >
          <planeGeometry args={[1000, 1000]} />
          <meshStandardMaterial color="#0f172a" roughness={0.9} />
        </mesh>

        {/* 3D Freeform Zone Meshes */}
        {meshes.map((mesh) => (
          <ZoneMeshItem
            key={mesh.id}
            mesh={mesh}
            isSelected={mesh.id === selectedMeshId}
            onSelect={onSelectMesh}
            onUpdateMesh={onUpdateMesh}
            onDraggingChange={(dragging) => {
              if (orbitRef.current) orbitRef.current.enabled = !dragging;
              if (dragging) {
                onGestureStart?.();
              } else {
                onCommitGesture?.();
              }
            }}
            transformMode={transformMode}
          />
        ))}

        <OrbitControls ref={orbitRef} makeDefault minDistance={5} maxDistance={250} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
    </div>
  );
}

/**
 * GltfTile — loads a `.glb` / `.gltf` model for a tile (PRD §16.2, §16.3).
 *
 * Model loading is lazy (only on tiles that reference a model) and shares
 * drei's loader cache, so the same URL is never fetched twice. If a model
 * fails to load (network error, corrupt file, missing asset), an error
 * boundary swaps it for the standard colored tile so a failed 3D asset
 * never corrupts the scene or the city state (§16.3).
 */

import { Component, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { TILE_META } from "../../config/tiles";

interface ModelMeshProps {
  url: string;
  position: [number, number, number];
  fallbackType: number;
}

interface BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

class ModelBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function ModelMesh({ url, position }: ModelMeshProps) {
  const { scene } = useGLTF(url);
  return (
    <group position={position}>
      <primitive
        object={scene}
        scale={0.9}
        rotation={[0, -Math.PI / 4, 0]}
      />
    </group>
  );
}

function FallbackBox({ position, fallbackType }: { position: [number, number, number]; fallbackType: number }) {
  const meta = TILE_META[fallbackType as keyof typeof TILE_META];
  const color = meta?.color ?? "#8d96a5";
  return (
    <mesh position={position as unknown as [number, number, number]}>
      <boxGeometry args={[0.96, 1, 0.96]} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}

/** A safe tile with model support; falls back to a colored box on failure. */
export function GltfTile({ url, position, fallbackType }: ModelMeshProps) {
  return (
    <ModelBoundary
      fallback={
        <FallbackBox
          position={position}
          fallbackType={fallbackType}
        />
      }
    >
      <ModelMesh url={url} position={position} fallbackType={fallbackType} />
    </ModelBoundary>
  );
}

/** Preload helper so future tiles reuse an already-fetched model. */
export function preloadGltf(url: string): void {
  useGLTF.preload(url);
}
/**
 * CityCanvas3D — React Three Fiber 3D view (PRD §16, Phase 5).
 *
 * Optional and non-blocking: the 2D planner remains the default and always
 * fully functional. This canvas is lazy-loaded by App so three.js/R3F only
 * enter the bundle when the user toggles 3D on.
 *
 * The camera frames the current city bounds and orbit/pans/zooms freely.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CityScene } from "./CityScene";
import type { GridState } from "../../types/city";
import { useTheme } from "../../hooks/useTheme";

interface CityCanvas3DProps {
  tiles: GridState;
  activeTool: string;
  onSelect?: (x: number, y: number) => void;
  presentationCamera?: PresentationCameraState;
  cameraFov?: number;
}

export interface PresentationCameraState {
  position: [number, number, number];
  target: [number, number, number];
}

function PresentationCamera({ view }: { view: PresentationCameraState }) {
  const { camera } = useThree();
  const position = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const currentTarget = useRef(new THREE.Vector3(...view.target));

  useFrame((_, delta) => {
    position.set(...view.position);
    target.set(...view.target);
    const amount = 1 - Math.exp(-delta * 5);
    camera.position.lerp(position, amount);
    currentTarget.current.lerp(target, amount);
    camera.lookAt(currentTarget.current);
  });

  return null;
}

export function CityCanvas3D({ tiles, activeTool, onSelect, presentationCamera, cameraFov = 45 }: CityCanvas3DProps) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  // Ambient + directional light tuned for the blueprint material look.
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [30, 28, 30], fov: cameraFov, near: 0.1, far: 2000 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={[dark ? "#080a0d" : "#f4f6f9"]} />
      <ambientLight intensity={dark ? 0.55 : 0.9} />
      <directionalLight
        position={[40, 60, 30]}
        intensity={dark ? 1.4 : 1.8}
        castShadow
      />
      <CityScene tiles={tiles} activeTool={activeTool} onSelect={onSelect} />
      {presentationCamera ? (
        <PresentationCamera view={presentationCamera} />
      ) : (
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={5}
          maxDistance={1000}
        />
      )}
    </Canvas>
  );
}
/**
 * CityScene — R3F scene contents (PRD §16, Phase 5).
 *
 * Every tile renders as an instanced colored box (Metro palette). When a
 * tile carries a `model_url`, a GLTF model replaces the box (via
 * `GltfTile`, which falls back to the box if the model fails to load — a
 * failed 3D asset never corrupts the scene or city state, §16.3).
 *
 * Instancing keeps the city performant even at thousands of tiles
 * (PRD §16.3: "avoid creating duplicate model instances unnecessarily").
 */

import { useMemo } from "react";
import { Grid, Instances, Instance } from "@react-three/drei";
import type { GridState, TileObject } from "../../types/city";
import { TILE_META } from "../../config/tiles";
import { GltfTile } from "./GltfTile";

interface CitySceneProps {
  tiles: GridState;
  activeTool: string;
  onSelect?: (x: number, y: number) => void;
}

const TILE_COLORS: Record<number, string> = {};
for (const [type, meta] of Object.entries(TILE_META)) {
  TILE_COLORS[Number(type)] = meta.color;
}

interface TileInstance {
  x: number;
  y: number;
  type: number;
  tile: TileObject;
}

export function CityScene({ tiles }: CitySceneProps) {
  const instances = useMemo<TileInstance[]>(() => {
    const out: TileInstance[] = [];
    tiles.forEach((tile, key) => {
      const [x, y] = key.split(",").map(Number);
      out.push({ x, y, type: tile.type, tile });
    });
    return out;
  }, [tiles]);

  const boxTiles = useMemo(() => instances.filter((t) => !t.tile.model_url), [instances]);
  const modelTiles = useMemo(() => instances.filter((t) => t.tile.model_url), [instances]);

  return (
    <group>
      {/* Infinite baseline grid (tone: control-tower blueprint linework). */}
      <Grid
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.6}
        cellColor={"#34404e"}
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor={"#46536a"}
        fadeDistance={120}
        fadeStrength={1}
        infiniteGrid
      />

      {/* Instanced colored boxes for tiles without a custom model. */}
      <Instances limit={Math.max(boxTiles.length, 1)} range={boxTiles.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.75}
          metalness={0.05}
          color={"#ffffff"}
        />
        {boxTiles.map((tile) => (
          <Instance
            key={`${tile.x},${tile.y}`}
            position={[tile.x - 0.5, 0.5, -(tile.y - 0.5)]}
            color={TILE_COLORS[tile.type] ?? "#8d96a5"}
          />
        ))}
      </Instances>

      {/* Model-backed tiles — each loads lazily, sharing the loader cache. */}
      {modelTiles.map((tile) => (
        <GltfTile
          key={`${tile.x},${tile.y}`}
          url={tile.tile.model_url!}
          position={[tile.x - 0.5, 0, -(tile.y - 0.5)]}
          fallbackType={tile.type}
        />
      ))}

      {/* Subtle emissive highlight on the active tool's placement layer */}
      <pointLight position={[20, 40, -20]} intensity={40} color="#62a8ff" />
    </group>
  );
}
"""GIS import API contracts (PRD §7.1, §12.2).

The request carries a geographic bounding box plus the desired grid origin;
the response is the *imported* tile map in the standard sparse JSON shape —
the backend is stateless here, so the client merges it into its own city.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app import config


class GisBounds(BaseModel):
    """Geographic bounding box in decimal degrees (PRD §7.2, §12.2)."""

    model_config = ConfigDict(extra="forbid")

    north: float = Field(ge=-90.0, le=90.0)
    south: float = Field(ge=-90.0, le=90.0)
    east: float = Field(ge=-180.0, le=180.0)
    west: float = Field(ge=-180.0, le=180.0)

    @model_validator(mode="after")
    def _ordered_and_small(self) -> "GisBounds":
        if self.north <= self.south:
            raise ValueError("bounds.north must be greater than bounds.south")
        if self.east <= self.west:
            raise ValueError("bounds.east must be greater than bounds.west")
        if (
            self.north - self.south > config.MAX_BBOX_SPAN_DEG
            or self.east - self.west > config.MAX_BBOX_SPAN_DEG
        ):
            raise ValueError(
                "selected area is too large; pick a smaller bounding box"
            )
        if (self.north - self.south) * (self.east - self.west) > config.MAX_BBOX_AREA_DEG2:
            raise ValueError(
                "selected area is too large; pick a smaller bounding box"
            )
        return self


class GisGridOrigin(BaseModel):
    """Sparse-grid origin the import maps onto (PRD §7.4)."""

    model_config = ConfigDict(extra="forbid")

    x: int = Field(ge=config.MIN_COORD, le=config.MAX_COORD)
    y: int = Field(ge=config.MIN_COORD, le=config.MAX_COORD)


class GisImportRequest(BaseModel):
    """`POST /api/gis/import` request body (PRD §12.2)."""

    model_config = ConfigDict(extra="forbid")

    bounds: GisBounds
    grid_origin: GisGridOrigin


class GisSpatialZone(BaseModel):
    id: str
    type: int
    position: dict[str, float]
    rotation: float
    footprint: dict[str, float]
    attributes: dict[str, str] = Field(default_factory=dict)


class GisSpatialRoadPoint(BaseModel):
    x: float
    y: float
    z: float = 0.0


class GisSpatialRoad(BaseModel):
    id: str
    type: int
    points: list[GisSpatialRoadPoint]
    width: float


class GisImportResponse(BaseModel):
    """`POST /api/gis/import` response (PRD §12.2, exact contract)."""

    tiles_imported: int
    updated_grid: dict[str, dict[str, int]]
    spatial_zones: list[GisSpatialZone] = Field(default_factory=list)
    spatial_roads: list[GisSpatialRoad] = Field(default_factory=list)


__all__ = [
    "GisBounds",
    "GisGridOrigin",
    "GisImportRequest",
    "GisImportResponse",
    "GisSpatialZone",
    "GisSpatialRoadPoint",
    "GisSpatialRoad",
]


"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CmsField, CmsTextAreaField } from "@/components/admin/cms/cms-field";
import { CmsImageField } from "@/components/admin/cms/cms-image-field";
import { CMS_IMAGE_SPECS } from "@/config/homepage-section-registry";
import type { HomepageMissionTileCms } from "@/config/homepage-cms";

function emptyTile(): HomepageMissionTileCms {
  return {
    label: "",
    body: "",
    operator: "",
    model: "",
    location: "",
    imageSrc: "",
    imageAlt: "",
    href: ""
  };
}

export function MissionTileEditor({
  tiles: initialTiles,
  onDirty
}: {
  tiles: HomepageMissionTileCms[];
  onDirty?: () => void;
}) {
  const [tiles, setTiles] = useState(initialTiles.length ? initialTiles : [emptyTile()]);

  const addTile = () => {
    setTiles((current) => [...current, emptyTile()]);
    onDirty?.();
  };

  const removeTile = (index: number) => {
    setTiles((current) => current.filter((_, i) => i !== index));
    onDirty?.();
  };

  return (
    <div className="grid gap-3">
      <input type="hidden" name="tile_count" value={String(tiles.length)} />
      {tiles.map((tile, index) => (
        <fieldset
          key={`mission-tile-${index}`}
          className="grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--platform-text-secondary)]">
              Tile {index + 1}
            </legend>
            {tiles.length > 1 ? (
              <button type="button" onClick={() => removeTile(index)} className="platform-btn-ghost platform-btn-sm inline-flex items-center gap-1 text-[var(--platform-danger)]">
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <CmsField label="Label" name={`tile_${index}_label`} defaultValue={tile.label} onChange={() => onDirty?.()} />
            <CmsField label="Operator" name={`tile_${index}_operator`} defaultValue={tile.operator} onChange={() => onDirty?.()} />
            <CmsField label="Model" name={`tile_${index}_model`} defaultValue={tile.model} onChange={() => onDirty?.()} />
            <CmsField label="Location" name={`tile_${index}_location`} defaultValue={tile.location} onChange={() => onDirty?.()} />
            <CmsField label="Link" name={`tile_${index}_href`} defaultValue={tile.href} onChange={() => onDirty?.()} />
          </div>
          <CmsTextAreaField label="Body" name={`tile_${index}_body`} defaultValue={tile.body} onChange={() => onDirty?.()} />
          <CmsImageField
            label="Tile image"
            name={`tile_${index}_image`}
            altName={`tile_${index}_image_alt`}
            defaultValue={tile.imageSrc}
            defaultAlt={tile.imageAlt}
            spec={CMS_IMAGE_SPECS.productCard}
            onPreviewChange={() => onDirty?.()}
          />
        </fieldset>
      ))}
      <button type="button" onClick={addTile} className="platform-btn-secondary platform-btn-sm inline-flex w-fit items-center gap-1.5">
        <Plus className="size-3.5" aria-hidden="true" />
        Add tile
      </button>
    </div>
  );
}

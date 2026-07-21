"use client";

import { CmsField, CmsTextAreaField } from "@/components/admin/cms/cms-field";
import { CmsImageField } from "@/components/admin/cms/cms-image-field";
import { CMS_IMAGE_SPECS } from "@/config/homepage-section-registry";
import type { HomepageMissionTileCms } from "@/config/homepage-cms";
import { editorHtmlToPlainText } from "@/lib/editor/prepare-html";

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

function tilesSyncKey(tiles: HomepageMissionTileCms[]) {
  return tiles
    .map((tile) => [tile.label, tile.body, tile.href, tile.imageSrc, tile.operator, tile.model, tile.location].join("\u0001"))
    .join("\u0002");
}

export function MissionTileEditor({
  tiles: initialTiles,
  onDirty,
  onUpload,
  onUploadingChange
}: {
  tiles: HomepageMissionTileCms[];
  onDirty?: () => void;
  onUpload?: (file: File) => Promise<{ src: string; alt?: string } | null>;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const tiles = initialTiles.length ? initialTiles : [emptyTile()];

  return (
    <div className="grid gap-3" key={tilesSyncKey(tiles)}>
      <input type="hidden" name="tile_count" value={String(tiles.length)} />
      {tiles.map((tile, index) => (
        <fieldset
          key={`mission-tile-${index}`}
          className="grid gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4"
        >
          <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--platform-text-secondary)]">
            Tile {index + 1}
          </legend>
          {/* Preserve unused metadata on save without showing it to editors */}
          <input type="hidden" name={`tile_${index}_operator`} value={tile.operator} readOnly />
          <input type="hidden" name={`tile_${index}_model`} value={tile.model} readOnly />
          <input type="hidden" name={`tile_${index}_location`} value={tile.location} readOnly />
          <div className="grid gap-3 min-[1280px]:grid-cols-2">
            <CmsField label="Label" name={`tile_${index}_label`} defaultValue={tile.label} onChange={() => onDirty?.()} />
            <CmsField label="Link" name={`tile_${index}_href`} defaultValue={tile.href} onChange={() => onDirty?.()} />
          </div>
          <CmsTextAreaField
            label="Body"
            name={`tile_${index}_body`}
            defaultValue={editorHtmlToPlainText(tile.body)}
            hint="Plain text is fine"
            onChange={() => onDirty?.()}
          />
          <CmsImageField
            label="Tile image"
            name={`tile_${index}_image`}
            altName={`tile_${index}_image_alt`}
            defaultValue={tile.imageSrc}
            defaultAlt={tile.imageAlt}
            spec={
              index === 0
                ? CMS_IMAGE_SPECS.missionTileHero
                : index === 1
                  ? CMS_IMAGE_SPECS.missionTileWide
                  : CMS_IMAGE_SPECS.missionTileSmall
            }
            onUpload={onUpload}
            onPreviewChange={() => onDirty?.()}
            onUploadingChange={onUploadingChange}
          />
        </fieldset>
      ))}
    </div>
  );
}

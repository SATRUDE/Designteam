import sharp from 'sharp';

export const MAX_TILE_HEIGHT = 4000;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_DIMENSION = 4096;

// Preserve pixels and vertical order. Wide overflow is an explicit failure, not
// an invisible resize which would invalidate the dimensions used in Figma.
export async function sliceTall(png, { maxTileHeight = MAX_TILE_HEIGHT } = {}) {
  if (!Number.isInteger(maxTileHeight) || maxTileHeight < 101 || maxTileHeight > MAX_DIMENSION) {
    throw new Error('maxTileHeight must be an integer between 101 and 4096.');
  }
  const { width, height } = await sharp(png).metadata();
  if (!width || !height || width > MAX_DIMENSION) {
    throw new Error('Capture exceeds the 4096px width limit or has invalid dimensions.');
  }
  const tiles = [];
  async function add(top, tileHeight) {
    const buffer = await sharp(png).extract({ left: 0, top, width, height: tileHeight }).png().toBuffer();
    if (buffer.length > MAX_BYTES) {
      if (tileHeight === 1) throw new Error('A single pixel row exceeds the upload size limit.');
      const half = Math.floor(tileHeight / 2);
      await add(top, half);
      await add(top + half, tileHeight - half);
      return;
    }
    tiles.push({ index: tiles.length, buffer, width, height: tileHeight });
  }
  for (let top = 0; top < height; top += maxTileHeight) {
    await add(top, Math.min(maxTileHeight, height - top));
  }
  return tiles;
}

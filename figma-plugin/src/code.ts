import type { DesignteamFigmaImportV1 } from "./payload";
import { validateImportPayload } from "./payload";

declare const __html__: string;

figma.showUI(__html__, { width: 420, height: 360, themeColors: true });

/** Strip data URLs and whitespace so atob / createImage accept the payload. */
function normalizeBase64ToRaw(b64: string): string {
  const t = b64.trim();
  const data = /^data:image\/[^;]+;base64,(.+)$/i.exec(t);
  return (data ? data[1] : t).replace(/\s/g, "");
}

function decodeBase64(b64: string): Uint8Array {
  const raw = normalizeBase64ToRaw(b64);
  if (typeof figma.base64Decode === "function") {
    return figma.base64Decode(raw);
  }
  const binary = atob(raw);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function runImport(data: DesignteamFigmaImportV1) {
  const imageMap = new Map<string, string>();
  for (const item of data.items) {
    for (const img of item.images) {
      imageMap.set(img.name, img.base64);
    }
  }

  // Import into the page currently open in Figma.
  const page = figma.currentPage;

  const pad = 40;
  const pairGap = 64;
  const groupGap = 256;
  const sectionHorizontalPadding = 96;
  const sectionVerticalPadding = 96;
  let maxFrameHeight = 0;
  let placedImages = 0;
  const labelGap = 16;

  const labelFont: FontName = { family: "Inter", style: "Regular" };
  await figma.loadFontAsync(labelFont);

  const orderedLayout = [...data.layout].sort((a, b) => a.order - b.order);

  async function createEntryFrame(entry: DesignteamFigmaImportV1["layout"][number]) {
    const group = figma.createFrame();
    group.name = entry.frameName.slice(0, 255);
    group.layoutMode = "VERTICAL";
    group.primaryAxisSizingMode = "AUTO";
    group.counterAxisSizingMode = "AUTO";
    group.itemSpacing = 0;
    group.fills = [];
    group.strokes = [];

    for (const imageName of entry.imageNames) {
      const b64 = imageMap.get(imageName);
      if (!b64) continue;
      let image: Image;
      try {
        image = figma.createImage(decodeBase64(b64));
      } catch (_err) {
        continue;
      }
      // Image has no sync width/height — use getSizeAsync.
      const { width: w, height: h } = await image.getSizeAsync();
      const rect = figma.createRectangle();
      rect.resize(w, h);
      rect.fills = [
        {
          type: "IMAGE",
          imageHash: image.hash,
          scaleMode: "FILL",
        },
      ];
      group.appendChild(rect);
      placedImages += 1;
    }

    if (group.children.length === 0) {
      group.remove();
      return null;
    }

    return group;
  }

  // Group by URL so each group is: mobile (left) + desktop (right).
  const groups = new Map<
    string,
    {
      url: string;
      mobile?: DesignteamFigmaImportV1["layout"][number];
      desktop?: DesignteamFigmaImportV1["layout"][number];
      firstOrder: number;
    }
  >();
  for (const entry of orderedLayout) {
    const existing = groups.get(entry.url);
    if (!existing) {
      groups.set(entry.url, {
        url: entry.url,
        mobile: entry.mode === "mobile" ? entry : undefined,
        desktop: entry.mode === "desktop" ? entry : undefined,
        firstOrder: entry.order,
      });
      continue;
    }
    if (entry.mode === "mobile") existing.mobile = entry;
    if (entry.mode === "desktop") existing.desktop = entry;
  }

  const orderedGroups = [...groups.values()].sort((a, b) => a.firstOrder - b.firstOrder);

  const rootSection = figma.createFrame();
  rootSection.name = "Section 1";
  rootSection.layoutMode = "HORIZONTAL";
  rootSection.primaryAxisSizingMode = "AUTO";
  rootSection.counterAxisSizingMode = "AUTO";
  rootSection.itemSpacing = groupGap;
  rootSection.paddingLeft = sectionHorizontalPadding;
  rootSection.paddingRight = sectionHorizontalPadding;
  rootSection.paddingTop = sectionVerticalPadding;
  rootSection.paddingBottom = sectionVerticalPadding;
  rootSection.fills = [];
  rootSection.strokes = [];
  rootSection.x = pad;
  rootSection.y = pad;

  for (const group of orderedGroups) {
    const mobileFrame = group.mobile ? await createEntryFrame(group.mobile) : null;
    const desktopFrame = group.desktop ? await createEntryFrame(group.desktop) : null;
    if (!mobileFrame && !desktopFrame) continue;

    const section = figma.createFrame();
    section.name = "Section";
    section.layoutMode = "VERTICAL";
    section.primaryAxisSizingMode = "AUTO";
    section.counterAxisSizingMode = "AUTO";
    section.itemSpacing = labelGap;
    section.paddingLeft = sectionHorizontalPadding;
    section.paddingRight = sectionHorizontalPadding;
    section.paddingTop = 0;
    section.paddingBottom = 0;
    section.fills = [];
    section.strokes = [];

    const label = figma.createText();
    label.fontName = labelFont;
    label.fontSize = 14;
    label.characters = group.url;
    label.textAutoResize = "WIDTH_AND_HEIGHT";
    label.fills = [{ type: "SOLID", color: { r: 0.11, g: 0.46, b: 0.97 } }];
    label.setRangeHyperlink(0, label.characters.length, { type: "URL", value: group.url });
    section.appendChild(label);

    const row = figma.createFrame();
    row.name = "Screens";
    row.layoutMode = "HORIZONTAL";
    row.primaryAxisSizingMode = "AUTO";
    row.counterAxisSizingMode = "AUTO";
    row.itemSpacing = pairGap;
    row.fills = [];
    row.strokes = [];
    section.appendChild(row);

    if (mobileFrame) {
      row.appendChild(mobileFrame);
    }
    if (desktopFrame) {
      row.appendChild(desktopFrame);
    }
    rootSection.appendChild(section);
    maxFrameHeight = Math.max(maxFrameHeight, section.height);
  }

  if (maxFrameHeight > 0) {
    figma.viewport.scrollAndZoomIntoView([rootSection]);
  } else {
    figma.viewport.scrollAndZoomIntoView([page]);
  }

  if (placedImages === 0 && orderedLayout.length > 0) {
    figma.notify(
      "No images were placed. Turn on “Slice images for Figma” when exporting if any screenshot is over 4096px tall/wide, and re-export JSON."
    );
  }
}

figma.ui.onmessage = (msg: { type?: string; json?: string }) => {
  if (msg.type !== "import" || typeof msg.json !== "string") return;

  void (async () => {
    try {
      const parsed: unknown = JSON.parse(msg.json as string);
      if (!validateImportPayload(parsed)) {
        figma.notify("Invalid Designteam import file (expected version 1).");
        return;
      }
      await runImport(parsed);
      figma.notify(`Imported: ${parsed.pageName}`);
    } catch (e) {
      figma.notify(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
};

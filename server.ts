import express from "express";
import path from "path";
import puppeteer, { type ElementHandle, type Page } from "puppeteer";
import sharp from "sharp";
import { createServer as createViteServer } from "vite";

type ImageFormat = "png" | "jpeg";
type CaptureStrategy =
  | "native-fullpage"
  | "clipped-chunks"
  | "native-element"
  | "clipped-element"
  | "split-smart"
  | "viewport"
  | "pdf";

interface CaptureArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SplitPoint {
  y: number;
  priority: number;
}

interface AvoidRange {
  start: number;
  end: number;
}

interface ZipFile {
  name: string;
  data: Buffer;
}

interface WatermarkOptions {
  enabled?: boolean;
  name?: string;
  text?: string;
  logo?: string;
  qr?: string;
  position?: "top" | "bottom";
}

const MAX_CHUNK_PHYSICAL_HEIGHT = 8000;
const DEFAULT_SPLIT_MAX_PHYSICAL_HEIGHT = 12000;

async function getPageHeight(page: Page) {
  return page.evaluate(() => {
    return Math.max(
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight,
      document.body.scrollHeight,
      document.body.offsetHeight,
    );
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function bufferFromDataUrl(dataUrl?: string) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateTextWidth(value: string, fontSize: number) {
  let units = 0;

  for (const char of value) {
    if (/[\u4e00-\u9fff\uff00-\uffef]/.test(char)) {
      units += 1;
    } else if (/[A-Z@#]/.test(char)) {
      units += 0.7;
    } else if (/[il.,:;|]/.test(char)) {
      units += 0.32;
    } else if (/\s/.test(char)) {
      units += 0.34;
    } else {
      units += 0.56;
    }
  }

  return Math.ceil(units * fontSize);
}

async function applySignatureWatermark(
  buffer: Buffer | Uint8Array,
  format: ImageFormat,
  options?: WatermarkOptions,
) {
  if (!options?.enabled) {
    return buffer;
  }

  const input = Buffer.from(buffer);
  const meta = await sharp(input).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  if (!width || !height) {
    return input;
  }

  const nameRaw = options.name?.trim() || "";
  const textRaw = options.text?.trim() || "";
  const logoBuffer = bufferFromDataUrl(options.logo);
  const qrBuffer = bufferFromDataUrl(options.qr);
  const hasName = !!nameRaw;
  const hasText = !!textRaw;
  const hasLogo = !!logoBuffer;
  const hasQr = !!qrBuffer;

  if (!hasName && !hasText && !hasLogo && !hasQr) {
    return input;
  }

  const position = options.position === "top" ? "top" : "bottom";
  const footerHeight = Math.round(clamp(width * 0.12, 150, 260));
  const paddingX = Math.round(clamp(width * 0.045, 44, 96));
  const avatarSize = Math.round(clamp(footerHeight * 0.52, 56, 120));
  const qrSize = Math.round(clamp(footerHeight * 0.56, 72, 132));
  const gap = Math.round(clamp(footerHeight * 0.07, 8, 12));
  const nameFontSize = Math.round(clamp(width * 0.022, 24, 40));
  const textFontSize = Math.round(clamp(width * 0.014, 16, 26));
  const lineGap = Math.round(clamp(footerHeight * 0.1, 8, 14));
  const showAvatar = hasLogo || hasName;
  const showText = hasName || hasText;
  const availableWidth = Math.max(0, width - paddingX * 2);
  const avatarWidth = showAvatar ? avatarSize : 0;
  const qrWidth = hasQr ? qrSize : 0;
  const leadingGap = showAvatar && (showText || hasQr) ? gap : 0;
  const trailingGap = showText && hasQr ? gap : 0;
  const measuredTextWidth = Math.max(
    hasName ? estimateTextWidth(nameRaw, nameFontSize) : 0,
    hasText ? estimateTextWidth(textRaw, textFontSize) : 0,
  );
  let textBlockWidth = showText
    ? Math.round(clamp(measuredTextWidth, 120, 460))
    : 0;

  if (showText) {
    const nonTextWidth = avatarWidth + leadingGap + trailingGap + qrWidth;
    textBlockWidth = Math.min(
      textBlockWidth,
      Math.max(140, availableWidth - nonTextWidth),
    );
  }

  const totalWidth =
    avatarWidth +
    leadingGap +
    (showText ? textBlockWidth : 0) +
    trailingGap +
    qrWidth;
  const startX = Math.max(paddingX, Math.round((width - totalWidth) / 2));
  const centerY = Math.round(footerHeight / 2);
  const avatarTop = Math.round((footerHeight - avatarSize) / 2);
  const qrTop = Math.round((footerHeight - qrSize) / 2);
  let cursorX = startX;
  let avatarLeft = 0;
  let textLeft = 0;
  let qrLeft = 0;

  if (showAvatar) {
    avatarLeft = cursorX;
    cursorX += avatarWidth + leadingGap;
  }

  if (showText) {
    textLeft = cursorX;
    cursorX += textBlockWidth;
    cursorX += trailingGap;
  }

  if (hasQr) {
    qrLeft = cursorX;
  }

  const lineY = position === "top" ? footerHeight - 0.5 : 0.5;
  const nameY =
    showText && hasName && hasText
      ? centerY - Math.round((textFontSize + lineGap) / 2)
      : centerY;
  const textY =
    showText && hasName && hasText
      ? centerY + Math.round((nameFontSize + lineGap) / 2)
      : centerY;
  const nameLengthAttr =
    hasName && estimateTextWidth(nameRaw, nameFontSize) > textBlockWidth
      ? ` textLength="${textBlockWidth}" lengthAdjust="spacingAndGlyphs"`
      : "";
  const textLengthAttr =
    hasText && estimateTextWidth(textRaw, textFontSize) > textBlockWidth
      ? ` textLength="${textBlockWidth}" lengthAdjust="spacingAndGlyphs"`
      : "";
  const footerSvg = Buffer.from(`
    <svg width="${width}" height="${footerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <line x1="${paddingX}" y1="${lineY}" x2="${width - paddingX}" y2="${lineY}" stroke="#e5e7eb" stroke-width="1"/>
      ${
        showText && hasName
          ? `<text x="${textLeft}" y="${nameY}" dominant-baseline="middle" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${nameFontSize}" font-weight="700" fill="#111827"${nameLengthAttr}>${escapeXml(nameRaw)}</text>`
          : ""
      }
      ${
        showText && hasText
          ? `<text x="${textLeft}" y="${textY}" dominant-baseline="middle" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${textFontSize}" font-weight="500" fill="#6b7280"${textLengthAttr}>${escapeXml(textRaw)}</text>`
          : ""
      }
    </svg>
  `);

  const composites: Array<{ input: Buffer; top: number; left: number }> = [
    {
      input: footerSvg,
      top: position === "top" ? 0 : height,
      left: 0,
    },
  ];

  if (hasLogo) {
    const logo = await sharp(logoBuffer!)
      .resize(avatarSize, avatarSize, { fit: "cover" })
      .png()
      .toBuffer();
    composites.push({
      input: logo,
      top: position === "top" ? avatarTop : height + avatarTop,
      left: avatarLeft,
    });
  } else if (hasName) {
    const placeholder = Buffer.from(`
      <svg width="${avatarSize}" height="${avatarSize}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="${Math.round(avatarSize * 0.22)}" fill="#eff6ff"/>
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif" font-size="${Math.round(avatarSize * 0.42)}" font-weight="800" fill="#2563eb">${escapeXml(nameRaw.replace(/^@/, "").slice(0, 1).toUpperCase() || "A")}</text>
      </svg>
    `);
    composites.push({
      input: placeholder,
      top: position === "top" ? avatarTop : height + avatarTop,
      left: avatarLeft,
    });
  }

  if (hasQr && qrBuffer) {
    const qr = await sharp(qrBuffer)
      .resize(qrSize, qrSize, { fit: "contain", background: "#ffffff" })
      .png()
      .toBuffer();
    composites.push({
      input: qr,
      top: position === "top" ? qrTop : height + qrTop,
      left: qrLeft,
    });
  }

  return sharp(input)
    .extend(
      position === "top"
        ? {
            top: footerHeight,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          }
        : {
            bottom: footerHeight,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
    )
    .composite(composites)
    .toFormat(
      format === "jpeg" ? "jpeg" : "png",
      format === "jpeg" ? { quality: 92 } : {},
    )
    .toBuffer();
}

function crc32(buffer: Buffer) {
  let crc = -1;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let j = 0; j < 8; j++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }

  return table;
})();

function createZip(files: ZipFile[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name);
    const checksum = crc32(file.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, file.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + file.data.length;
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function getSmartSplitHints(
  page: Page,
  options: {
    baseY: number;
    totalHeight: number;
    selector?: string;
  },
): Promise<{ points: SplitPoint[]; avoidRanges: AvoidRange[] }> {
  const serializedOptions = JSON.stringify(options);

  return page.evaluate(`
    (() => {
    const { baseY, totalHeight, selector } = ${serializedOptions};
    const root = selector ? document.querySelector(selector) : document.body;
    const points = [
      { y: 0, priority: 100 },
      { y: totalHeight, priority: 100 },
    ];
    const avoidRanges = [];

    if (!root) {
      return { points, avoidRanges };
    }

    const clamp = (value) => Math.max(0, Math.min(totalHeight, value));
    const pushPoint = (absoluteY, priority) => {
      const y = clamp(absoluteY - baseY);
      if (y > 0 && y < totalHeight) {
        points.push({ y, priority });
      }
    };

    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = rect.bottom + window.scrollY;
      return { top, bottom };
    };

    root.querySelectorAll('h2').forEach((element) => {
      pushPoint(rectFor(element).top, 95);
    });

    root.querySelectorAll('h3').forEach((element) => {
      pushPoint(rectFor(element).top, 80);
    });

    root.querySelectorAll('p, ul, ol, blockquote, section, article, hr').forEach((element) => {
      const rect = rectFor(element);
      pushPoint(rect.top, 55);
      pushPoint(rect.bottom + 12, 60);
    });

    root.querySelectorAll('pre, table').forEach((element) => {
      const rect = rectFor(element);
      const start = clamp(rect.top - baseY);
      const end = clamp(rect.bottom - baseY);
      if (end > start) {
        avoidRanges.push({ start, end });
      }
      pushPoint(rect.top, 65);
      pushPoint(rect.bottom + 16, 75);
    });

    const unique = new Map();
    points.forEach((point) => {
      const y = Math.round(point.y);
      unique.set(y, Math.max(unique.get(y) || 0, point.priority));
    });

    return {
      points: Array.from(unique, ([y, priority]) => ({ y, priority })).sort((a, b) => a.y - b.y),
      avoidRanges: avoidRanges.sort((a, b) => a.start - b.start),
    };
    })()
  `) as Promise<{ points: SplitPoint[]; avoidRanges: AvoidRange[] }>;
}

function isInsideAvoidRange(y: number, avoidRanges: AvoidRange[]) {
  return avoidRanges.some((range) => y > range.start && y < range.end);
}

function moveCutOutsideAvoidRange(
  y: number,
  cursor: number,
  target: number,
  minPartHeight: number,
  avoidRanges: AvoidRange[],
) {
  const range = avoidRanges.find((item) => y > item.start && y < item.end);
  if (!range) return y;

  if (range.start - cursor >= minPartHeight) {
    return range.start;
  }

  if (range.end > cursor && range.end <= target + (target - cursor) * 0.1) {
    return range.end;
  }

  return y;
}

function buildSmartSplitRanges(options: {
  totalHeight: number;
  maxPartHeight: number;
  points: SplitPoint[];
  avoidRanges: AvoidRange[];
}) {
  const { totalHeight, maxPartHeight, avoidRanges } = options;
  const minPartHeight = Math.min(1600, Math.max(600, maxPartHeight * 0.25));
  const points = options.points
    .filter((point) => point.y >= 0 && point.y <= totalHeight)
    .sort((a, b) => a.y - b.y);
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  while (cursor < totalHeight) {
    const remaining = totalHeight - cursor;

    if (remaining <= maxPartHeight) {
      ranges.push({ start: cursor, end: totalHeight });
      break;
    }

    const target = cursor + maxPartHeight;
    const sectionCut = [...points]
      .reverse()
      .find(
        (point) =>
          point.priority >= 90 &&
          point.y > cursor + minPartHeight &&
          point.y <= target,
      );
    const softCut = [...points]
      .reverse()
      .find(
        (point) =>
          point.priority < 90 &&
          point.y > cursor + minPartHeight &&
          point.y <= target &&
          !isInsideAvoidRange(point.y, avoidRanges),
      );

    let cut = sectionCut?.y ?? softCut?.y ?? target;
    cut = moveCutOutsideAvoidRange(
      cut,
      cursor,
      target,
      minPartHeight,
      avoidRanges,
    );
    cut = Math.max(cursor + 1, Math.min(totalHeight, Math.round(cut)));

    ranges.push({ start: cursor, end: cut });
    cursor = cut;
  }

  return ranges;
}

async function captureClippedArea(
  page: Page,
  options: {
    area: CaptureArea;
    deviceScaleFactor: number;
    format: ImageFormat;
  },
) {
  const { area, deviceScaleFactor, format } = options;
  const physicalTotalHeight = Math.round(area.height * deviceScaleFactor);
  const physicalWidth = Math.round(area.width * deviceScaleFactor);

  if (physicalTotalHeight <= MAX_CHUNK_PHYSICAL_HEIGHT) {
    return page.screenshot({
      type: format,
      clip: area,
      captureBeyondViewport: true,
    });
  }

  const chunkHeight = Math.max(
    1,
    Math.floor(MAX_CHUNK_PHYSICAL_HEIGHT / deviceScaleFactor),
  );
  const chunks: Array<{ input: Buffer; top: number; left: number }> = [];

  for (let y = 0; y < area.height; y += chunkHeight) {
    const clipHeight = Math.min(chunkHeight, area.height - y);
    const chunk = await page.screenshot({
      type: "png",
      clip: {
        x: area.x,
        y: area.y + y,
        width: area.width,
        height: clipHeight,
      },
      captureBeyondViewport: true,
    });

    chunks.push({
      input: Buffer.from(chunk),
      top: Math.round(y * deviceScaleFactor),
      left: 0,
    });
  }

  return sharp({
    create: {
      width: physicalWidth,
      height: physicalTotalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(chunks)
    .toFormat(
      format === "jpeg" ? "jpeg" : "png",
      format === "jpeg" ? { quality: 92 } : {},
    )
    .toBuffer();
}

async function captureSplitImages(
  page: Page,
  options: {
    area: CaptureArea;
    selector?: string;
    deviceScaleFactor: number;
    format: ImageFormat;
    splitMaxHeight: number;
    watermark?: WatermarkOptions;
  },
) {
  const { area, selector, deviceScaleFactor, format, watermark } = options;
  const maxPhysicalHeight = Math.max(
    2000,
    options.splitMaxHeight || DEFAULT_SPLIT_MAX_PHYSICAL_HEIGHT,
  );
  const maxPartHeight = Math.max(
    1,
    Math.floor(maxPhysicalHeight / deviceScaleFactor),
  );
  const { points, avoidRanges } = await getSmartSplitHints(page, {
    baseY: area.y,
    totalHeight: area.height,
    selector,
  });
  const ranges = buildSmartSplitRanges({
    totalHeight: area.height,
    maxPartHeight,
    points,
    avoidRanges,
  });
  const pad = String(ranges.length).length;
  const files: ZipFile[] = [];

  console.log(
    `Splitting ${Math.round(area.height)}px area into ${ranges.length} image parts, max ${maxPhysicalHeight}px physical height each...`,
  );

  for (const [index, range] of ranges.entries()) {
    const buffer = await captureClippedArea(page, {
      area: {
        x: area.x,
        y: area.y + range.start,
        width: area.width,
        height: range.end - range.start,
      },
      deviceScaleFactor,
      format,
    });
    const finalBuffer = await applySignatureWatermark(
      buffer,
      format,
      watermark,
    );

    files.push({
      name: `part-${String(index + 1).padStart(pad, "0")}.${format}`,
      data: Buffer.from(finalBuffer),
    });
  }

  return {
    buffer: createZip(files),
    strategy: "split-smart" as const,
    partCount: files.length,
  };
}

async function captureFullPageImage(
  page: Page,
  options: {
    width: number;
    deviceScaleFactor: number;
    format: ImageFormat;
  },
): Promise<{ buffer: Buffer | Uint8Array; strategy: CaptureStrategy }> {
  const { width, deviceScaleFactor, format } = options;
  const pageHeight = await getPageHeight(page);
  const physicalTotalHeight = Math.round(pageHeight * deviceScaleFactor);

  if (physicalTotalHeight <= MAX_CHUNK_PHYSICAL_HEIGHT) {
    return {
      buffer: await page.screenshot({ type: format, fullPage: true }),
      strategy: "native-fullpage",
    };
  }

  const chunkHeight = Math.max(
    1,
    Math.floor(MAX_CHUNK_PHYSICAL_HEIGHT / deviceScaleFactor),
  );
  const chunks: Array<{ input: Buffer; top: number; left: number }> = [];

  console.log(
    `Page height ${pageHeight}px @${deviceScaleFactor}x exceeds safe limit, using clipped chunk capture...`,
  );

  for (let y = 0; y < pageHeight; y += chunkHeight) {
    const clipHeight = Math.min(chunkHeight, pageHeight - y);
    const chunk = await page.screenshot({
      type: "png",
      clip: {
        x: 0,
        y,
        width,
        height: clipHeight,
      },
      captureBeyondViewport: true,
    });

    chunks.push({
      input: Buffer.from(chunk),
      top: Math.round(y * deviceScaleFactor),
      left: 0,
    });
  }

  const physicalWidth = Math.round(width * deviceScaleFactor);

  const buffer = await sharp({
    create: {
      width: physicalWidth,
      height: physicalTotalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(chunks)
    .toFormat(
      format === "jpeg" ? "jpeg" : "png",
      format === "jpeg" ? { quality: 92 } : {},
    )
    .toBuffer();

  return { buffer, strategy: "clipped-chunks" };
}

async function captureElementImage(
  element: ElementHandle<Element>,
  options: {
    page: Page;
    deviceScaleFactor: number;
    format: ImageFormat;
  },
) {
  const { page, deviceScaleFactor, format } = options;
  const box = await element.boundingBox();

  if (!box) {
    throw new Error("Selected element is not visible or has no layout box");
  }

  const physicalTotalHeight = Math.round(box.height * deviceScaleFactor);

  if (physicalTotalHeight <= MAX_CHUNK_PHYSICAL_HEIGHT) {
    return {
      buffer: await element.screenshot({ type: format }),
      strategy: "native-element" as const,
    };
  }

  const chunkHeight = Math.max(
    1,
    Math.floor(MAX_CHUNK_PHYSICAL_HEIGHT / deviceScaleFactor),
  );
  const chunks: Array<{ input: Buffer; top: number; left: number }> = [];

  console.log(
    `Element height ${box.height}px @${deviceScaleFactor}x exceeds safe limit, using clipped element capture...`,
  );

  for (let y = 0; y < box.height; y += chunkHeight) {
    const clipHeight = Math.min(chunkHeight, box.height - y);
    const chunk = await page.screenshot({
      type: "png",
      clip: {
        x: box.x,
        y: box.y + y,
        width: box.width,
        height: clipHeight,
      },
      captureBeyondViewport: true,
    });

    chunks.push({
      input: Buffer.from(chunk),
      top: Math.round(y * deviceScaleFactor),
      left: 0,
    });
  }

  const buffer = await sharp({
    create: {
      width: Math.round(box.width * deviceScaleFactor),
      height: physicalTotalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(chunks)
    .toFormat(
      format === "jpeg" ? "jpeg" : "png",
      format === "jpeg" ? { quality: 92 } : {},
    )
    .toBuffer();

  return { buffer, strategy: "clipped-element" as const };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  app.use(express.json({ limit: "50mb" }));

  app.post("/api/capture", async (req, res) => {
    const {
      url,
      htmlContent,
      format = "png",
      fullPage = true,
      selector,
      width = 1920,
      height = 1080,
      deviceScaleFactor = 1,
      pdfBreakAvoidSelectors,
      pdfMargin = "0px",
      splitLongImage = false,
      splitMaxHeight = DEFAULT_SPLIT_MAX_PHYSICAL_HEIGHT,
      watermarkEnabled = false,
      watermarkName,
      watermarkText,
      watermarkLogo,
      watermarkQr,
      watermarkPosition = "bottom",
    } = req.body;
    const watermark: WatermarkOptions = {
      enabled: watermarkEnabled,
      name: watermarkName,
      text: watermarkText,
      logo: watermarkLogo,
      qr: watermarkQr,
      position: watermarkPosition === "top" ? "top" : "bottom",
    };

    if (!url && !htmlContent) {
      return res.status(400).json({ error: "URL or HTML Content is required" });
    }

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

    try {
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
        headless: true,
      });

      const page = await browser.newPage();
      await page.setViewport({
        width,
        height: height || 1080,
        deviceScaleFactor,
      });

      if (htmlContent) {
        await page.setContent(htmlContent, {
          waitUntil: "networkidle0" as any,
          timeout: 30000,
        });
      } else {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      }

      let resultBuffer;
      let contentType;

      if (format === "pdf") {
        // Auto-inject print styles to prevent page breaks inside elements
        let printStyleContent = `
            @media print {
              h1, h2, h3, h4, h5, h6,
              p, img, svg, table, tr, th, td,
              pre, code, blockquote, li, figure,
              [class*="card"], [class*="box"], [class*="panel"], [class*="alert"], [class*="container"], [class*="item"],
              [style*="background"], [class*="bg-"] {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          `;

        if (pdfBreakAvoidSelectors) {
          printStyleContent += `
             @media print {
               ${pdfBreakAvoidSelectors} {
                 page-break-inside: avoid !important;
                 break-inside: avoid !important;
                 display: block !important;
               }
             }
           `;
        }

        await page.addStyleTag({
          content: printStyleContent,
        });

        resultBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: pdfMargin,
            bottom: pdfMargin,
            left: pdfMargin,
            right: pdfMargin,
          },
        });
        contentType = "application/pdf";
        res.setHeader("X-Capture-Strategy", "pdf");
      } else {
        // png or jpeg
        if (selector) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            const element = await page.$(selector);
            if (!element) {
              throw new Error(`Selector "${selector}" not found`);
            }

            const box = await element.boundingBox();
            if (!box) {
              throw new Error(
                "Selected element is not visible or has no layout box",
              );
            }

            const capture = splitLongImage
              ? await captureSplitImages(page, {
                  area: box,
                  selector,
                  deviceScaleFactor,
                  format: format as ImageFormat,
                  splitMaxHeight,
                  watermark,
                })
              : await captureElementImage(element, {
                  page,
                  deviceScaleFactor,
                  format: format as ImageFormat,
                });
            resultBuffer = capture.buffer;
            res.setHeader("X-Capture-Strategy", capture.strategy);
            if ("partCount" in capture) {
              res.setHeader("X-Split-Part-Count", String(capture.partCount));
              res.setHeader(
                "Content-Disposition",
                'attachment; filename="screenshot-parts.zip"',
              );
            }
          } catch (e: any) {
            return res.status(400).json({
              error: e.message || `Could not capture selector ${selector}`,
            });
          }
        } else if (fullPage) {
          const capture = splitLongImage
            ? await captureSplitImages(page, {
                area: {
                  x: 0,
                  y: 0,
                  width,
                  height: await getPageHeight(page),
                },
                deviceScaleFactor,
                format: format as ImageFormat,
                splitMaxHeight,
                watermark,
              })
            : await captureFullPageImage(page, {
                width,
                deviceScaleFactor,
                format: format as ImageFormat,
              });
          resultBuffer = capture.buffer;
          res.setHeader("X-Capture-Strategy", capture.strategy);
          if ("partCount" in capture) {
            res.setHeader("X-Split-Part-Count", String(capture.partCount));
            res.setHeader(
              "Content-Disposition",
              'attachment; filename="screenshot-parts.zip"',
            );
          }
        } else {
          resultBuffer = await page.screenshot({
            type: format as any,
            fullPage: false,
          });
          res.setHeader("X-Capture-Strategy", "viewport");
        }
        if (!(splitLongImage && (selector || fullPage))) {
          resultBuffer = await applySignatureWatermark(
            resultBuffer,
            format as ImageFormat,
            watermark,
          );
        }
        contentType =
          splitLongImage && (selector || fullPage)
            ? "application/zip"
            : `image/${format}`;
      }

      res.setHeader("Content-Type", contentType);
      res.send(Buffer.from(resultBuffer));
    } catch (error: any) {
      console.error("Failed to capture:", error);
      res
        .status(500)
        .json({ error: "Failed to capture the webpage: " + error.message });
    } finally {
      await browser?.close();
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(
      `(Also accessible on your network at http://<your-ip>:${PORT} and locally on http://127.0.0.1:${PORT})`,
    );
  });
}

startServer();

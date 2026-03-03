import puppeteer from 'puppeteer';
import { Property, Photo, Slide } from 'shared';
import { PDF, LINE_HEIGHT_MM, CHAR_WIDTH_MM, formatPrice } from 'shared';
import { getImagePath } from './imageProcessor';
import { highlightTexts } from './highlighter';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ─── Per-slide-type image dimensions (mozjpeg via Sharp) ─────────────────────
// Chrome PDF renderer = 96 DPI: 1mm ≈ 3.78 px
// Подаём РОВНО столько пикселей, сколько Chrome отрендерит — без излишков.

// Fullscreen/floorplan: (297-10)×(210-10)mm = 287×200mm → 1085×756px @ 96DPI
const IMG_FULLSCREEN_W = 1090;
const IMG_FULLSCREEN_H = 760;
const IMG_FULLSCREEN_Q = 50;

// Content/advantages/title/grid(3-4): 139×96.5mm → 525×365px @ 96DPI
const IMG_REGULAR_W = 530;
const IMG_REGULAR_H = 370;
const IMG_REGULAR_Q = 50;

// Grid (2 фото, одна строка на всю высоту): 139×198mm → 530×750px @ 96DPI
const IMG_GRID_TALL_W = 530;
const IMG_GRID_TALL_H = 750;
const IMG_GRID_TALL_Q = 50;

// Cache of optimized data URLs per size category
let optimizedFullscreen: Map<string, string> = new Map();
let optimizedRegular: Map<string, string> = new Map();
let optimizedGridTall: Map<string, string> = new Map();

/**
 * Оптимизирует фото: crop + resize до точных размеров контейнера.
 * fit: 'cover' обрезает фото до нужного аспекта ДО вставки в HTML,
 * чтобы Chrome не кропил на лету (иначе JPEG passthrough ломается
 * и Chrome сохраняет пиксели как FlateDecode — раздувает PDF в 10-20x).
 */
async function optimizePhoto(filename: string, w: number, h: number, quality: number): Promise<string> {
  const filePath = getImagePath(filename);
  if (!fs.existsSync(filePath)) return '';
  try {
    const buffer = await sharp(filePath)
      .resize(w, h, { fit: 'cover', position: 'centre' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    const data = fs.readFileSync(filePath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  }
}

type PhotoSize = 'regular' | 'fullscreen' | 'grid-tall';

function photoDataUrl(filename: string, size: PhotoSize = 'regular'): string {
  switch (size) {
    case 'fullscreen': return optimizedFullscreen.get(filename) || optimizedRegular.get(filename) || '';
    case 'grid-tall':  return optimizedGridTall.get(filename) || optimizedRegular.get(filename) || '';
    default:           return optimizedRegular.get(filename) || '';
  }
}

// ─── Overflow detection & auto-shrink ────────────────────────────────────────

interface TextFitResult {
  fontSize: number;
  lineHeight: number;
  marginBottom: string;
}

/**
 * Оценивает высоту текста для заданных параметров шрифта.
 * charWidthMm корректируется пропорционально размеру шрифта.
 */
function estimateTextHeightWithParams(
  paragraphs: string[],
  colWidthMm: number,
  fontSize: number,
  lineHeight: number,
  marginMm: number,
): number {
  const adjustedCharWidth = CHAR_WIDTH_MM * (fontSize / PDF.FONT_SIZE_BODY);
  const cpl = Math.floor(colWidthMm / adjustedCharWidth);
  const lineHeightMm = fontSize * 0.353 * lineHeight;
  let totalHeight = 0;
  for (const para of paragraphs) {
    let paraLines = 0;
    for (const line of para.split('\n')) {
      paraLines += Math.max(1, Math.ceil(line.length / cpl));
    }
    totalHeight += paraLines * lineHeightMm + marginMm;
  }
  return totalHeight;
}

/**
 * Многоуровневое сжатие текста: подбирает fontSize + lineHeight,
 * чтобы текст поместился в 95% высоты контентной области.
 */
function fitTextToSlide(
  paragraphs: string[],
  colWidthMm: number,
  contentHeightMm: number = PDF.CONTENT_HEIGHT_MM,
): TextFitResult {
  const tiers: TextFitResult[] = [
    { fontSize: 20, lineHeight: 1.2,  marginBottom: '8mm' },    // Tier 1: стандарт (пустая строка)
    { fontSize: 19, lineHeight: 1.15, marginBottom: '7mm' },    // Tier 2: чуть меньше
    { fontSize: 18, lineHeight: 1.1,  marginBottom: '6mm' },    // Tier 3: компактнее
    { fontSize: 17, lineHeight: 1.05, marginBottom: '5mm' },    // Tier 4: ещё компактнее
    { fontSize: 16, lineHeight: 1.0,  marginBottom: '4mm' },    // Tier 5: крайний случай
  ];

  for (const tier of tiers) {
    const height = estimateTextHeightWithParams(
      paragraphs, colWidthMm, tier.fontSize, tier.lineHeight, parseFloat(tier.marginBottom),
    );
    if (height <= contentHeightMm * 0.88) {
      return tier;
    }
  }
  return tiers[tiers.length - 1];
}

/** Совместимая обёртка для layoutEngine (используется LINE_HEIGHT_MM по умолчанию) */
function estimateTextHeight(paragraphs: string[], colWidthMm: number): number {
  const cpl = Math.floor(colWidthMm / CHAR_WIDTH_MM);
  let lines = 0;
  for (const para of paragraphs) {
    for (const line of para.split('\n')) {
      lines += Math.max(1, Math.ceil(line.length / cpl));
    }
    lines += PDF.PARAGRAPH_MARGIN_MM / LINE_HEIGHT_MM;
  }
  return lines * LINE_HEIGHT_MM;
}

// ─── Title name auto-shrink ──────────────────────────────────────────────────

/**
 * Подбирает размер шрифта для названия, чтобы оно помещалось в одну строку.
 * Уменьшает от 36pt до минимум 22pt.
 */
function fitTitleName(name: string, maxWidthMm: number): number {
  const maxFontSize = PDF.FONT_SIZE_NAME; // 36pt
  const minFontSize = 22;
  for (let fs = maxFontSize; fs >= minFontSize; fs -= 2) {
    const charW = CHAR_WIDTH_MM * (fs / PDF.FONT_SIZE_BODY);
    const charsPerLine = Math.floor(maxWidthMm / charW);
    if (name.length <= charsPerLine) return fs;
  }
  return minFontSize;
}

// ─── Title slide ─────────────────────────────────────────────────────────────

function renderTitleSlide(property: Property, photos: Photo[]): string {
  const tableRows = [
    { label: 'Площадь',    value: property.area },
    { label: 'Этаж',       value: property.floor },
    { label: 'Отделка',    value: property.finish },
    { label: 'Срок сдачи', value: property.deliveryDate },
    ...(property.extraFields ?? []).filter(f => f.label.trim() && f.value.trim()),
  ].filter(r => r.value && r.value.trim());

  const p1 = photos[0];
  const p2 = photos[1];

  // Форматируем цену: убираем "Стоимость:", разбиваем по разрядам
  const priceFormatted = property.price ? formatPrice(property.price) : '';

  const titleName = property.name || 'Презентация объекта';
  const titleFontSize = fitTitleName(titleName, PDF.TITLE_TEXT_WIDTH_MM);

  return `
    <div class="slide">
      <div class="slide-body" style="gap:${PDF.COLUMN_GAP_MM}mm">

        <!-- LEFT col: name / address / metro / price / table -->
        <div class="title-left">
          <div class="title-name" style="font-size:${titleFontSize}pt">${titleName}</div>
          ${property.address ? `<div class="title-sub">${property.address}</div>` : ''}
          ${property.metro   ? `<div class="title-sub">${property.metro}</div>` : ''}
          ${priceFormatted ? `<div class="price-badge">${priceFormatted}</div>` : ''}
          ${tableRows.length > 0 ? `
          <table class="prop-table">
            <tbody>
              ${tableRows.map((r, i) => `
                <tr style="background:${i % 2 === 0 ? PDF.COLOR_TABLE_BG : '#fff'}">
                  <td class="prop-label">${r.label}</td>
                  <td class="prop-value">${r.value}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : ''}
        </div>

        <!-- RIGHT col: 2 photos -->
        <div class="photos-col">
          <div class="photo-frame">${p1 ? `<img src="${photoDataUrl(p1.filename)}" class="photo-img" />` : '<div class="photo-ph"></div>'}</div>
          <div class="photo-frame">${p2 ? `<img src="${photoDataUrl(p2.filename)}" class="photo-img" />` : '<div class="photo-ph"></div>'}</div>
        </div>

      </div>
    </div>`;
}

// ─── Advantages slide ─────────────────────────────────────────────────────────

function renderAdvantagesSlide(advantages: string[], photos: Photo[], hlMap: Map<string, string>): string {
  // Многоуровневое сжатие для преимуществ
  const totalLines = advantages.length * 1.8;
  const availableHeight = PDF.CONTENT_HEIGHT_MM * 0.85;
  const lineHeightMm1 = PDF.FONT_SIZE_BULLET * 0.353 * PDF.LINE_HEIGHT;
  const lineHeightMm2 = (PDF.FONT_SIZE_BULLET - 1) * 0.353 * PDF.LINE_HEIGHT;
  const lineHeightMm3 = PDF.FONT_SIZE_BODY_MIN * 0.353 * PDF.LINE_HEIGHT_COMPACT;

  let fontOverride: number = PDF.FONT_SIZE_BULLET;
  let lhOverride: number = PDF.LINE_HEIGHT;
  if (totalLines * lineHeightMm1 > availableHeight) {
    fontOverride = PDF.FONT_SIZE_BULLET - 1;
    if (totalLines * lineHeightMm2 > availableHeight) {
      fontOverride = PDF.FONT_SIZE_BODY_MIN;
      lhOverride = PDF.LINE_HEIGHT_COMPACT;
    }
  }

  return `
    <div class="slide">
      <div class="slide-body">
        <div class="text-col">
          <div class="slide-heading">ПРЕИМУЩЕСТВА</div>
          <ul class="adv-list" style="font-size:${fontOverride}pt; line-height:${lhOverride}">
            ${advantages.map(a => `<li class="adv-item">${hlMap.get(a) ?? a}</li>`).join('')}
          </ul>
        </div>
        ${renderPhotosCol(photos)}
      </div>
    </div>`;
}

function renderPhotosCol(photos: Photo[]): string {
  const p1 = photos[0]; const p2 = photos[1];
  // Если только 1 фото — одно крупное по центру
  if (p1 && !p2) {
    return `<div class="photos-col" style="justify-content:center">
      <div class="photo-frame"><img src="${photoDataUrl(p1.filename)}" class="photo-img"/></div>
    </div>`;
  }
  return `<div class="photos-col">
    <div class="photo-frame">${p1 ? `<img src="${photoDataUrl(p1.filename)}" class="photo-img"/>` : '<div class="photo-ph"></div>'}</div>
    <div class="photo-frame">${p2 ? `<img src="${photoDataUrl(p2.filename)}" class="photo-img"/>` : '<div class="photo-ph"></div>'}</div>
  </div>`;
}

// ─── Content slide ────────────────────────────────────────────────────────────

function renderContentSlide(paragraphs: string[], photos: Photo[], hlMap: Map<string, string>): string {
  // Многоуровневое авто-сжатие шрифта (на оригинальном plain-тексте!)
  const fit = fitTextToSlide(paragraphs, PDF.TEXT_COLUMN_WIDTH_MM);

  return `
    <div class="slide">
      <div class="slide-body">
        <div class="text-col">
          ${paragraphs.map(p => {
            const hl = hlMap.get(p) ?? p;
            return `<p class="body-p" style="font-size:${fit.fontSize}pt; line-height:${fit.lineHeight}; margin-bottom:${fit.marginBottom}">${hl.replace(/\n/g, '<br/>')}</p>`;
          }).join('')}
        </div>
        ${renderPhotosCol(photos)}
      </div>
    </div>`;
}

// ─── Fullscreen / floor plan ──────────────────────────────────────────────────

function renderFullscreenSlide(photo: Photo): string {
  return `<div class="slide fullscreen-slide"><img src="${photoDataUrl(photo.filename, 'fullscreen')}" class="fullscreen-img" /></div>`;
}

// ─── Full-text slide (без фото, шрифт чуть крупнее) ──────────────────────────

function renderFullTextSlide(paragraphs: string[], hlMap: Map<string, string>): string {
  // Многоуровневое авто-сжатие (на оригинальном plain-тексте!)
  const fit = fitTextToSlide(paragraphs, PDF.CONTENT_WIDTH_MM);
  // Если текст влезает без сжатия — используем чуть больший шрифт для full-text
  const fontSize = (fit.fontSize === PDF.FONT_SIZE_BODY) ? PDF.FONT_SIZE_BODY_FULL : fit.fontSize;

  return `
    <div class="slide">
      <div class="slide-body">
        <div class="text-col text-col-full">
          ${paragraphs.map(p => {
            const hl = hlMap.get(p) ?? p;
            return `<p class="body-p" style="font-size:${fontSize}pt; line-height:${fit.lineHeight}; margin-bottom:${fit.marginBottom}">${hl.replace(/\n/g, '<br/>')}</p>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ─── Photo grid 2×2 ──────────────────────────────────────────────────────────

function renderPhotoGridSlide(photos: Photo[]): string {
  const cells = photos.slice(0, 4);

  // 0 фото → пустой слайд
  if (cells.length === 0) {
    return `<div class="slide photo-grid-slide"><div class="photo-grid"></div></div>`;
  }

  // 1 фото → fullscreen (высокое разрешение)
  if (cells.length === 1) {
    return `<div class="slide fullscreen-slide"><img src="${photoDataUrl(cells[0].filename, 'fullscreen')}" class="fullscreen-img" /></div>`;
  }

  // 2 фото → один ряд на всю высоту
  if (cells.length === 2) {
    return `
      <div class="slide photo-grid-slide">
        <div class="photo-grid" style="grid-template-rows: 1fr;">
          <div class="grid-cell"><img src="${photoDataUrl(cells[0].filename, 'grid-tall')}" class="photo-img"/></div>
          <div class="grid-cell"><img src="${photoDataUrl(cells[1].filename, 'grid-tall')}" class="photo-img"/></div>
        </div>
      </div>`;
  }

  // 3 фото → 2 сверху + 1 по центру снизу
  if (cells.length === 3) {
    return `
      <div class="slide photo-grid-slide">
        <div class="photo-grid">
          <div class="grid-cell"><img src="${photoDataUrl(cells[0].filename)}" class="photo-img"/></div>
          <div class="grid-cell"><img src="${photoDataUrl(cells[1].filename)}" class="photo-img"/></div>
          <div class="grid-cell grid-cell-center"><img src="${photoDataUrl(cells[2].filename)}" class="photo-img"/></div>
        </div>
      </div>`;
  }

  // 4 фото → стандартная 2×2
  return `
    <div class="slide photo-grid-slide">
      <div class="photo-grid">
        ${cells.map(p => `<div class="grid-cell"><img src="${photoDataUrl(p.filename)}" class="photo-img"/></div>`).join('')}
      </div>
    </div>`;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
  @page { size: 297mm 210mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: ${PDF.FONT_SIZE_BODY}pt; color: ${PDF.COLOR_TEXT}; background: white; }

  .slide {
    width: 297mm; height: 210mm;
    padding: ${PDF.MARGIN_TOP_MM}mm ${PDF.MARGIN_RIGHT_MM}mm ${PDF.MARGIN_BOTTOM_MM}mm ${PDF.MARGIN_LEFT_MM}mm;
    background: white; overflow: hidden; page-break-after: always;
    display: flex; flex-direction: column;
  }

  /* ── Title left column ── */
  .title-left {
    width: ${PDF.TITLE_TEXT_WIDTH_MM}mm;
    flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden;
  }
  .title-name {
    font-size: ${PDF.FONT_SIZE_NAME}pt; font-weight: bold; color: ${PDF.COLOR_TEXT};
    line-height: 1.2; margin-bottom: 3mm; text-transform: uppercase;
  }
  .title-sub {
    font-size: ${PDF.FONT_SIZE_SUB}pt; color: ${PDF.COLOR_TEXT}; line-height: 1.4; margin-bottom: 1.5mm;
  }
  .price-badge {
    display: flex; align-items: center; justify-content: center;
    width: 100%;
    background: ${PDF.COLOR_PRICE_BADGE}; color: white;
    font-size: ${PDF.FONT_SIZE_PRICE}pt; font-weight: bold;
    padding: 3mm 4mm; margin-top: 2mm; margin-bottom: 3mm;
    text-align: center;
  }

  /* ── Property table ── */
  .prop-table { width: 100%; border-collapse: collapse; }
  .prop-label { font-size: ${PDF.FONT_SIZE_TABLE_LABEL}pt; color: ${PDF.COLOR_TEXT}; font-weight: bold; padding: 2.5mm 4mm; width: 45%; vertical-align: middle; }
  .prop-value { font-size: ${PDF.FONT_SIZE_TABLE_VALUE}pt; padding: 2.5mm 4mm; vertical-align: middle; }

  /* ── Slide body (all slides) ── */
  .slide-body { display: flex; flex: 1; gap: ${PDF.COLUMN_GAP_MM}mm; overflow: hidden; }
  .slide-heading {
    font-size: ${PDF.FONT_SIZE_HEADING}pt; font-weight: bold; color: ${PDF.COLOR_TEXT};
    margin-bottom: 4mm; flex-shrink: 0; letter-spacing: 0.5pt;
  }

  /* ── Text columns ── */
  .text-col { width: ${PDF.TEXT_COLUMN_WIDTH_MM}mm; overflow: hidden; flex-shrink: 0; }
  .text-col-full { width: ${PDF.CONTENT_WIDTH_MM}mm !important; }
  .body-p {
    margin-bottom: ${PDF.PARAGRAPH_MARGIN_MM}mm; line-height: ${PDF.LINE_HEIGHT};
    font-size: ${PDF.FONT_SIZE_BODY}pt; text-align: left;
  }
  .body-p:last-child { margin-bottom: 0; }

  /* ── Advantages ── */
  .adv-list { list-style: disc; padding-left: 8mm; font-size: ${PDF.FONT_SIZE_BULLET}pt; line-height: ${PDF.LINE_HEIGHT}; }
  .adv-item { margin-bottom: 2.5mm; }

  /* ── Photos column ── */
  .photos-col { width: ${PDF.PHOTO_COLUMN_WIDTH_MM}mm; display: flex; flex-direction: column; gap: ${PDF.PHOTO_GAP_MM}mm; flex-shrink: 0; align-items: flex-end; justify-content: center; }
  .photo-frame { width: ${PDF.PHOTO_WIDTH_MM}mm; height: ${PDF.PHOTO_HEIGHT_MM}mm; overflow: hidden; flex-shrink: 0; }
  .photo-img { width: 100%; height: 100%; object-fit: fill; display: block; }
  .photo-ph { width: 100%; height: 100%; background: #eee; }

  /* ── Fullscreen ── */
  .fullscreen-slide { padding: ${PDF.FULLSCREEN_PADDING_MM}mm; }
  .fullscreen-img { width: 100%; height: 100%; object-fit: fill; display: block; }

  /* ── Photo grid ── */
  .photo-grid-slide {}
  .photo-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: ${PDF.GRID_GAP_MM}mm; width: 100%; flex: 1; }
  .grid-cell { overflow: hidden; }
  .grid-cell-center { grid-column: 1 / -1; max-width: 50%; justify-self: center; }

  /* ── Keyword highlight ── */
  .kw { font-weight: 700; color: ${PDF.COLOR_RED_ACCENT}; }
`;

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(
  property: Property,
  photos: Photo[],
  slides: Slide[],
  hlParaMap: Map<string, string>,
  hlAdvMap: Map<string, string>,
): string {
  const photoMap = new Map(photos.map(p => [p.id, p]));
  const sp = (ids: string[]) => ids.map(id => photoMap.get(id)).filter(Boolean) as Photo[];

  const htmls = slides.map(slide => {
    const sphotos = sp(slide.photoIds);
    switch (slide.type) {
      case 'title':      return renderTitleSlide(property, sphotos);
      case 'advantages': return renderAdvantagesSlide(property.advantages, sphotos, hlAdvMap);
      case 'content':    return renderContentSlide(slide.paragraphs ?? [], sphotos, hlParaMap);
      case 'fullscreen': return sphotos[0] ? renderFullscreenSlide(sphotos[0]) : '';
      case 'floorplan':  return sphotos[0] ? renderFullscreenSlide(sphotos[0]) : '';
      case 'full-text':  return renderFullTextSlide(slide.paragraphs ?? [], hlParaMap);
      case 'photo-grid': return renderPhotoGridSlide(sphotos);
      default: return '';
    }
  });

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>${CSS}</style></head>
<body>${htmls.join('')}</body></html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

const PDF_OUT_DIR = path.join(__dirname, '..', '..', 'data', 'pdfs');
if (!fs.existsSync(PDF_OUT_DIR)) fs.mkdirSync(PDF_OUT_DIR, { recursive: true });

export async function generatePdf(property: Property, photos: Photo[], slides: Slide[]): Promise<string> {
  // Categorize photos by container size for pre-crop optimization
  const photoMap = new Map(photos.map(p => [p.id, p]));
  const fullscreenFilenames = new Set<string>();
  const regularFilenames = new Set<string>();
  const gridTallFilenames = new Set<string>();

  for (const slide of slides) {
    const isFullscreen = slide.type === 'fullscreen' || slide.type === 'floorplan';
    // photo-grid с 2 фото → высокие ячейки (139×198mm)
    const isGridTall = slide.type === 'photo-grid' && slide.photoIds.length === 2;
    // photo-grid с 1 фото → fullscreen
    const isGridSingle = slide.type === 'photo-grid' && slide.photoIds.length === 1;

    for (const pid of slide.photoIds) {
      const photo = photoMap.get(pid);
      if (photo?.filename) {
        if (isFullscreen || isGridSingle) fullscreenFilenames.add(photo.filename);
        else if (isGridTall) gridTallFilenames.add(photo.filename);
        else regularFilenames.add(photo.filename);
      }
    }
  }

  // Pre-crop & optimize all photos with Sharp (mozjpeg) at exact container sizes
  optimizedFullscreen = new Map();
  optimizedRegular = new Map();
  optimizedGridTall = new Map();
  await Promise.all([
    ...Array.from(fullscreenFilenames).map(async (fn) => {
      optimizedFullscreen.set(fn, await optimizePhoto(fn, IMG_FULLSCREEN_W, IMG_FULLSCREEN_H, IMG_FULLSCREEN_Q));
    }),
    ...Array.from(regularFilenames).map(async (fn) => {
      optimizedRegular.set(fn, await optimizePhoto(fn, IMG_REGULAR_W, IMG_REGULAR_H, IMG_REGULAR_Q));
    }),
    ...Array.from(gridTallFilenames).map(async (fn) => {
      optimizedGridTall.set(fn, await optimizePhoto(fn, IMG_GRID_TALL_W, IMG_GRID_TALL_H, IMG_GRID_TALL_Q));
    }),
  ]);

  // ── AI keyword highlighting ──────────────────────────────────────────────
  const allParagraphs: string[] = [];
  for (const slide of slides) {
    if ((slide.type === 'content' || slide.type === 'full-text') && slide.paragraphs) {
      allParagraphs.push(...slide.paragraphs);
    }
  }
  const allAdvantages = property.advantages ?? [];

  const highlighted = await highlightTexts(allParagraphs, allAdvantages);

  const hlParaMap = new Map<string, string>();
  allParagraphs.forEach((orig, i) => hlParaMap.set(orig, highlighted.paragraphs[i]));
  const hlAdvMap = new Map<string, string>();
  allAdvantages.forEach((orig, i) => hlAdvMap.set(orig, highlighted.advantages[i]));

  const html = buildHtml(property, photos, slides, hlParaMap, hlAdvMap);
  const outPath = path.join(PDF_OUT_DIR, `${property.id}_${Date.now()}.pdf`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outPath,
      width: '297mm',
      height: '210mm',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      outline: false,
      tagged: false,
    });
  } finally {
    await browser.close();
  }
  return outPath;
}

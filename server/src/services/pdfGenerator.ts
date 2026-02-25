import puppeteer from 'puppeteer';
import { Property, Photo, Slide } from 'shared';
import { PDF, LINE_HEIGHT_MM, CHAR_WIDTH_MM, formatPrice } from 'shared';
import { getImagePath } from './imageProcessor';
import Jimp from 'jimp';
import fs from 'fs';
import path from 'path';

// Max image dimensions for PDF (139mm at 150dpi ≈ 821px)
const PDF_IMG_MAX_W = 900;
const PDF_IMG_MAX_H = 700;
const PDF_IMG_QUALITY = 72;

// Cache of optimized data URLs, populated before HTML generation
let optimizedPhotos: Map<string, string> = new Map();

async function optimizePhotoForPdf(filename: string): Promise<string> {
  const filePath = getImagePath(filename);
  if (!fs.existsSync(filePath)) return '';
  try {
    const image = await Jimp.read(filePath);
    if (image.getWidth() > PDF_IMG_MAX_W || image.getHeight() > PDF_IMG_MAX_H) {
      image.scaleToFit(PDF_IMG_MAX_W, PDF_IMG_MAX_H);
    }
    const buffer = await image.quality(PDF_IMG_QUALITY).getBufferAsync(Jimp.MIME_JPEG);
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    const data = fs.readFileSync(filePath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  }
}

function photoDataUrl(filename: string): string {
  return optimizedPhotos.get(filename) || '';
}

// ─── Overflow detection ──────────────────────────────────────────────────────
// Оценивает, влезет ли текст в колонку. Если нет — уменьшаем шрифт на 1pt.

function estimateTextHeight(paragraphs: string[], colWidthMm: number): number {
  const cpl = Math.floor(colWidthMm / CHAR_WIDTH_MM);
  let lines = 0;
  for (const para of paragraphs) {
    for (const line of para.split('\n')) {
      lines += Math.max(1, Math.ceil(line.length / cpl));
    }
    lines += 0.5; // paragraph margin
  }
  return lines * LINE_HEIGHT_MM;
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

  return `
    <div class="slide">
      <div class="slide-body" style="gap:${PDF.COLUMN_GAP_MM}mm">

        <!-- LEFT col: name / address / metro / price / table -->
        <div class="title-left">
          <div class="title-name">${property.name || ''}</div>
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

function renderAdvantagesSlide(advantages: string[], photos: Photo[]): string {
  // Проверяем, влезут ли все буллеты; если нет — уменьшаем шрифт
  const totalLines = advantages.length * 1.8; // ~1.8 строки на буллет (с отступом)
  const maxLines = PDF.CONTENT_HEIGHT_MM / LINE_HEIGHT_MM * 0.85;
  const fontOverride = totalLines > maxLines ? PDF.FONT_SIZE_BULLET - 1 : PDF.FONT_SIZE_BULLET;

  // Заголовок внутри текстовой колонки, чтобы фото занимали полную высоту
  return `
    <div class="slide">
      <div class="slide-body">
        <div class="text-col">
          <div class="slide-heading">ПРЕИМУЩЕСТВА</div>
          <ul class="adv-list" style="font-size:${fontOverride}pt">
            ${advantages.map(a => `<li class="adv-item">${a}</li>`).join('')}
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

function renderContentSlide(paragraphs: string[], photos: Photo[]): string {
  // Авто-уменьшение шрифта если текст не влезает
  const heightEst = estimateTextHeight(paragraphs, PDF.TEXT_COLUMN_WIDTH_MM);
  const overflow = heightEst > PDF.CONTENT_HEIGHT_MM * 0.95;
  const fontSize = overflow ? PDF.FONT_SIZE_BODY - 1 : PDF.FONT_SIZE_BODY;

  return `
    <div class="slide">
      <div class="slide-body">
        <div class="text-col">
          ${paragraphs.map(p => `<p class="body-p" style="font-size:${fontSize}pt">${p.replace(/\n/g, '<br/>')}</p>`).join('')}
        </div>
        ${renderPhotosCol(photos)}
      </div>
    </div>`;
}

// ─── Fullscreen / floor plan ──────────────────────────────────────────────────

function renderFullscreenSlide(photo: Photo): string {
  return `<div class="slide fullscreen-slide"><img src="${photoDataUrl(photo.filename)}" class="fullscreen-img" /></div>`;
}

// ─── Full-text slide (без фото, шрифт чуть крупнее) ──────────────────────────

function renderFullTextSlide(paragraphs: string[]): string {
  // Авто-уменьшение если переполнение
  const heightEst = estimateTextHeight(paragraphs, PDF.CONTENT_WIDTH_MM);
  const overflow = heightEst > PDF.CONTENT_HEIGHT_MM * 0.95;
  const fontSize = overflow ? PDF.FONT_SIZE_BODY : PDF.FONT_SIZE_BODY_FULL;

  return `
    <div class="slide">
      <div class="slide-body">
        <div class="text-col text-col-full">
          ${paragraphs.map(p => `<p class="body-p" style="font-size:${fontSize}pt">${p.replace(/\n/g, '<br/>')}</p>`).join('')}
        </div>
      </div>
    </div>`;
}

// ─── Photo grid 2×2 ──────────────────────────────────────────────────────────

function renderPhotoGridSlide(photos: Photo[]): string {
  const cells = photos.slice(0, 4);

  // Если ровно 3 фото: первая строка — 2 фото, вторая — 1 по центру (span 2 cols)
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

  const empty = Math.max(0, 4 - cells.length);
  return `
    <div class="slide photo-grid-slide">
      <div class="photo-grid">
        ${cells.map(p => `<div class="grid-cell"><img src="${photoDataUrl(p.filename)}" class="photo-img"/></div>`).join('')}
        ${Array.from({length: empty}).map(() => '<div class="grid-cell" style="background:#f0f0f0"></div>').join('')}
      </div>
    </div>`;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
  @page { size: 297mm 210mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: ${PDF.FONT_SIZE_BODY}pt; color: ${PDF.COLOR_TEXT}; background: white; }

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
    font-size: ${PDF.FONT_SIZE_SUB}pt; color: #444; line-height: 1.4; margin-bottom: 1.5mm;
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
  .prop-label { font-size: ${PDF.FONT_SIZE_TABLE_LABEL}pt; color: #555; padding: 2.5mm 4mm; width: 45%; vertical-align: middle; }
  .prop-value { font-size: ${PDF.FONT_SIZE_TABLE_VALUE}pt; font-weight: bold; padding: 2.5mm 4mm; vertical-align: middle; }

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
    margin-bottom: 5mm; line-height: ${PDF.LINE_HEIGHT};
    font-size: ${PDF.FONT_SIZE_BODY}pt; text-align: left;
  }
  .body-p:last-child { margin-bottom: 0; }

  /* ── Advantages ── */
  .adv-list { list-style: disc; padding-left: 5mm; font-size: ${PDF.FONT_SIZE_BULLET}pt; line-height: ${PDF.LINE_HEIGHT}; }
  .adv-item { margin-bottom: 2.5mm; }

  /* ── Photos column ── */
  .photos-col { width: ${PDF.PHOTO_COLUMN_WIDTH_MM}mm; display: flex; flex-direction: column; gap: ${PDF.PHOTO_GAP_MM}mm; flex-shrink: 0; align-items: flex-end; justify-content: center; }
  .photo-frame { width: ${PDF.PHOTO_WIDTH_MM}mm; height: ${PDF.PHOTO_HEIGHT_MM}mm; overflow: hidden; flex-shrink: 0; }
  .photo-img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
  .photo-ph { width: 100%; height: 100%; background: #eee; }

  /* ── Fullscreen ── */
  .fullscreen-slide { padding: ${PDF.FULLSCREEN_PADDING_MM}mm; }
  .fullscreen-img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }

  /* ── Photo grid ── */
  .photo-grid-slide {}
  .photo-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: ${PDF.GRID_GAP_MM}mm; width: 100%; flex: 1; }
  .grid-cell { overflow: hidden; }
  .grid-cell-center { grid-column: 1 / -1; max-width: 50%; justify-self: center; }
`;

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(property: Property, photos: Photo[], slides: Slide[]): string {
  const photoMap = new Map(photos.map(p => [p.id, p]));
  const sp = (ids: string[]) => ids.map(id => photoMap.get(id)).filter(Boolean) as Photo[];

  const htmls = slides.map(slide => {
    const sphotos = sp(slide.photoIds);
    switch (slide.type) {
      case 'title':      return renderTitleSlide(property, sphotos);
      case 'advantages': return renderAdvantagesSlide(property.advantages, sphotos);
      case 'content':    return renderContentSlide(slide.paragraphs ?? [], sphotos);
      case 'fullscreen': return sphotos[0] ? renderFullscreenSlide(sphotos[0]) : '';
      case 'floorplan':  return sphotos[0] ? renderFullscreenSlide(sphotos[0]) : '';
      case 'full-text':  return renderFullTextSlide(slide.paragraphs ?? []);
      case 'photo-grid': return renderPhotoGridSlide(sphotos);
      default: return '';
    }
  });

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"/><style>${CSS}</style></head>
<body>${htmls.join('')}</body></html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

const PDF_OUT_DIR = path.join(__dirname, '..', '..', 'data', 'pdfs');
if (!fs.existsSync(PDF_OUT_DIR)) fs.mkdirSync(PDF_OUT_DIR, { recursive: true });

export async function generatePdf(property: Property, photos: Photo[], slides: Slide[]): Promise<string> {
  // Pre-optimize all photos for PDF embedding (resize + compress)
  const allFilenames = new Set<string>();
  for (const photo of photos) {
    if (photo.filename) allFilenames.add(photo.filename);
  }
  optimizedPhotos = new Map();
  await Promise.all(
    Array.from(allFilenames).map(async (fn) => {
      optimizedPhotos.set(fn, await optimizePhotoForPdf(fn));
    })
  );

  const html = buildHtml(property, photos, slides);
  const outPath = path.join(PDF_OUT_DIR, `${property.id}_${Date.now()}.pdf`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: outPath, width: '297mm', height: '210mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  } finally {
    await browser.close();
  }
  return outPath;
}

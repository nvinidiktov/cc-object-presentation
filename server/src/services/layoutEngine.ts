import { Property, Photo, Slide, SlideType, LayoutResult } from 'shared';
import { LINE_HEIGHT_MM, CHAR_WIDTH_MM, CHARS_PER_LINE_CONTENT, CHARS_PER_LINE_FULLTEXT, PDF } from 'shared';

const PARAGRAPH_MARGIN_LINES = PDF.PARAGRAPH_MARGIN_MM / LINE_HEIGHT_MM; // ≈0.33
import { v4 as uuid } from 'uuid';

// ─── Paragraph fitting ───────────────────────────────────────────────────────

const BULLET_RE = /^[\u2022\u2013\u2014\-–—]\s/;
const HEADER_COLON_RE = /:\s*$/;

/** Буллет: строка начинается с маркера (•, –, -, —) */
function isBulletLine(text: string): boolean {
  return BULLET_RE.test(text);
}

/** Заголовок-секция: ВСЕ заглавные буквы (>= 3 букв) — вроде «ОПИСАНИЕ ОБЪЕКТА» */
function isSectionHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const letters = trimmed.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/** Заголовок перед буллетами: строка заканчивается на ":" */
function isBulletHeader(text: string): boolean {
  return HEADER_COLON_RE.test(text.trim());
}

/**
 * Оценивает количество строк, которые займёт абзац в колонке заданной ширины.
 * Учитывает контекст: буллеты и заголовки с ":" получают маленький отступ.
 */
function estimateParagraphLines(paragraph: string, charsPerLine: number, nextParagraph?: string): number {
  if (!paragraph.trim()) return PARAGRAPH_MARGIN_LINES;
  const hardLines = paragraph.split('\n');
  let totalLines = 0;
  for (const line of hardLines) {
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }

  // Контекстные отступы:
  const curBullet = isBulletLine(paragraph);
  const nextBullet = nextParagraph ? isBulletLine(nextParagraph) : false;
  const curBulletHeader = isBulletHeader(paragraph);
  const curSection = isSectionHeading(paragraph);

  let marginLines: number;
  if (curBulletHeader && nextBullet) {
    marginLines = 0;  // Заголовок списка → буллет: без отступа
  } else if (curBullet && nextBullet) {
    marginLines = 0;  // Буллет → буллет: без отступа
  } else if (curBullet || curBulletHeader) {
    marginLines = PARAGRAPH_MARGIN_LINES;  // Конец списка → полный отступ
  } else if (curSection) {
    marginLines = 2 / LINE_HEIGHT_MM;  // CAPS-заголовок → маленький отступ
  } else {
    marginLines = PARAGRAPH_MARGIN_LINES;  // Обычный текст → полный отступ
  }

  return totalLines + marginLines;
}

/**
 * Оценивает суммарную высоту массива абзацев в мм
 */
function estimateHeightMm(paragraphs: string[], charsPerLine: number): number {
  const totalLines = paragraphs.reduce(
    (sum, p, i) => sum + estimateParagraphLines(p, charsPerLine, paragraphs[i + 1]),
    0
  );
  return totalLines * LINE_HEIGHT_MM;
}

// ─── Tier-aware slide fit check (mirrors fitTextToSlide in renderer) ──────────

const FIT_TIERS = [
  { fontSize: 20, lineHeight: 1.2,  marginMm: 8 },
  { fontSize: 19, lineHeight: 1.15, marginMm: 7 },
  { fontSize: 18, lineHeight: 1.1,  marginMm: 6 },
];

/**
 * Проверяет, помещается ли текст при конкретном tier-е шрифта.
 * tierIndex: 0 = 20pt (стандарт), 1 = 19pt, 2 = 18pt.
 * Порог 0.85 — чуть консервативнее рендерера (0.88), запас на погрешность.
 */
function fitsAtTier(
  paragraphs: string[],
  colWidthMm: number,
  tierIndex: number,
  contentHeightMm: number = PDF.CONTENT_HEIGHT_MM,
): boolean {
  const tier = FIT_TIERS[tierIndex];
  const threshold = contentHeightMm * 0.85;
  const adjustedCharWidth = CHAR_WIDTH_MM * (tier.fontSize / PDF.FONT_SIZE_BODY);
  const cpl = Math.floor(colWidthMm / adjustedCharWidth);
  const lineHeightMm = tier.fontSize * 0.353 * tier.lineHeight;
  let totalHeight = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    let paraLines = 0;
    for (const line of para.split('\n')) {
      paraLines += Math.max(1, Math.ceil(line.length / cpl));
    }
    const nextP = paragraphs[i + 1];
    let mb = tier.marginMm;
    if (!nextP) mb = 0;
    else if (isBulletHeader(para) && isBulletLine(nextP)) mb = 0;
    else if (isBulletLine(para) && isBulletLine(nextP)) mb = 0;
    else if (isSectionHeading(para)) mb = 2;
    totalHeight += paraLines * lineHeightMm + mb;
  }
  return totalHeight <= threshold;
}

/**
 * Проверяет, поместится ли текст хотя бы при одном из tier-ов (20→19→18pt).
 * Используется для splitOversizedParagraphs — разрезаем только если даже 18pt не хватает.
 */
function canFitOnSlide(
  paragraphs: string[],
  colWidthMm: number,
  contentHeightMm: number = PDF.CONTENT_HEIGHT_MM,
): boolean {
  for (let t = 0; t < FIT_TIERS.length; t++) {
    if (fitsAtTier(paragraphs, colWidthMm, t, contentHeightMm)) return true;
  }
  return false;
}

// ─── Auto-split oversized paragraphs by sentence boundaries ─────────────────

/**
 * Если абзац не помещается на один слайд — разрезает его по границам предложений.
 * Каждый кусок гарантированно заканчивается полным предложением.
 */
function splitOversizedParagraphs(
  paragraphs: string[],
  colWidthMm: number,
): string[] {
  const result: string[] = [];
  for (const para of paragraphs) {
    if (canFitOnSlide([para], colWidthMm)) {
      result.push(para);
      continue;
    }
    // Разрезаем на предложения: точка/!/? после которых идёт пробел + заглавная буква
    // Не ломает "кв.м.", "т.д.", "д. 5" и подобные сокращения
    const sentences = para.match(/[^.!?]*(?:[.!?]+(?=\s+[А-ЯA-Z«"(•\-–—])|[.!?]+\s*$)/g);
    if (!sentences) {
      result.push(para);
      continue;
    }
    // Жадная упаковка предложений в куски, влезающие на слайд
    let chunk = '';
    for (const sent of sentences) {
      const candidate = chunk + sent;
      if (chunk && !canFitOnSlide([candidate], colWidthMm)) {
        result.push(chunk.trim());
        chunk = sent;
      } else {
        chunk = candidate;
      }
    }
    if (chunk.trim()) result.push(chunk.trim());
  }
  return result;
}

// ─── Atomic text blocks (bullet groups stay together) ────────────────────────

interface TextBlock {
  paragraphs: string[];
  isAtomicGroup: boolean;
}

/**
 * Группирует абзацы в атомарные блоки:
 * - Заголовок с ":" + последующие буллеты → один неразрывный блок
 * - Последовательные буллеты без заголовка → один неразрывный блок
 * - Обычный абзац или секционный заголовок → отдельный блок
 */
function groupParagraphsIntoBlocks(paragraphs: string[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  let i = 0;

  while (i < paragraphs.length) {
    const p = paragraphs[i];

    // Заголовок с ":" + буллеты → атомарная группа
    if (isBulletHeader(p) && i + 1 < paragraphs.length && isBulletLine(paragraphs[i + 1])) {
      const group = [p];
      i++;
      while (i < paragraphs.length && isBulletLine(paragraphs[i])) {
        group.push(paragraphs[i]);
        i++;
      }
      blocks.push({ paragraphs: group, isAtomicGroup: true });
      continue;
    }

    // Последовательные буллеты без заголовка → атомарная группа
    if (isBulletLine(p)) {
      const group: string[] = [];
      while (i < paragraphs.length && isBulletLine(paragraphs[i])) {
        group.push(paragraphs[i]);
        i++;
      }
      blocks.push({ paragraphs: group, isAtomicGroup: true });
      continue;
    }

    // Обычный абзац или секционный заголовок
    blocks.push({ paragraphs: [p], isAtomicGroup: false });
    i++;
  }

  return blocks;
}

// ─── Main layout engine ──────────────────────────────────────────────────────

export function buildLayout(
  property: Property,
  photos: Photo[]
): LayoutResult {
  const warnings: string[] = [];

  // Разбиваем описание на абзацы (любой перенос строки = новый абзац)
  const rawParagraphs = property.description
    .split(/\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Авто-разбивка слишком длинных абзацев по предложениям
  // Используем ширину текстовой колонки (самая узкая = content слайд)
  const allParagraphs = splitOversizedParagraphs(
    rawParagraphs,
    PDF.TEXT_COLUMN_WIDTH_MM,
  );

  // Делим фото по типам
  const regularPhotos = photos
    .filter(p => p.type === 'regular')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const fullscreenPhotos = photos
    .filter(p => p.type === 'fullscreen')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const floorplanPhotos = photos
    .filter(p => p.type === 'floorplan')
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // ─── Фаза 1: Собираем «основные» слайды (title, advantages, content, full-text, photo-grid)
  const coreSlides: Slide[] = [];

  // Слайд 1: Титульный
  const titlePhotoIds = regularPhotos.slice(0, 2).map(p => p.id);
  coreSlides.push({
    id: uuid(),
    type: 'title',
    photoIds: titlePhotoIds,
    orderIndex: 0,
  });
  let regularPhotoIndex = 2;

  if (regularPhotos.length < 2) {
    warnings.push('Для титульного слайда нужно минимум 2 фото.');
  }

  // Слайд 2: Преимущества
  if (property.advantages.length > 0) {
    const advPhotoIds = regularPhotos.slice(regularPhotoIndex, regularPhotoIndex + 2).map(p => p.id);
    regularPhotoIndex += 2;
    coreSlides.push({
      id: uuid(),
      type: 'advantages',
      photoIds: advPhotoIds,
      orderIndex: coreSlides.length,
    });
  }

  // ─── Слайды с контентом: жадный алгоритм с атомарными блоками ──────────
  const blocks = groupParagraphsIntoBlocks(allParagraphs);
  let blockIndex = 0;

  while (blockIndex < blocks.length || regularPhotoIndex < regularPhotos.length) {
    if (blockIndex >= blocks.length && regularPhotoIndex >= regularPhotos.length) break;

    // Если закончились блоки текста, но фото ещё есть → Photo Grid слайды
    if (blockIndex >= blocks.length) {
      while (regularPhotoIndex < regularPhotos.length) {
        const batch = regularPhotos.slice(regularPhotoIndex, regularPhotoIndex + 4);
        coreSlides.push({
          id: uuid(),
          type: 'photo-grid',
          photoIds: batch.map(p => p.id),
          orderIndex: coreSlides.length,
        });
        regularPhotoIndex += 4;
      }
      break;
    }

    // Если закончились фото, но текст ещё есть → Full-text слайды
    if (regularPhotoIndex >= regularPhotos.length) {
      while (blockIndex < blocks.length) {
        const slideParas: string[] = [];
        while (blockIndex < blocks.length) {
          const block = blocks[blockIndex];
          // Секционный заголовок (CAPS) всегда начинает НОВЫЙ слайд
          if (isSectionHeading(block.paragraphs[0]) && slideParas.length > 0) break;
          const candidate = [...slideParas, ...block.paragraphs];
          if (fitsAtTier(candidate, PDF.CONTENT_WIDTH_MM, 0)) {
            // Влезает при 20pt — добавляем
            slideParas.push(...block.paragraphs);
            blockIndex++;
          } else if (slideParas.length > 0) {
            // Не влезает при 20pt, но уже есть контент → переносим на следующий слайд
            break;
          } else {
            // Пустой слайд, блок слишком большой для 20pt → добавляем (рендерер уменьшит шрифт)
            slideParas.push(...block.paragraphs);
            blockIndex++;
            break;
          }
        }
        coreSlides.push({
          id: uuid(),
          type: 'full-text',
          paragraphs: slideParas,
          photoIds: [],
          orderIndex: coreSlides.length,
        });
      }
      break;
    }

    // Есть и текст, и фото → Content слайд (блоки = атомарные единицы)
    const slideParas: string[] = [];
    while (blockIndex < blocks.length) {
      const block = blocks[blockIndex];
      // Секционный заголовок (CAPS) всегда начинает НОВЫЙ слайд
      if (isSectionHeading(block.paragraphs[0]) && slideParas.length > 0) break;
      const candidate = [...slideParas, ...block.paragraphs];
      if (fitsAtTier(candidate, PDF.TEXT_COLUMN_WIDTH_MM, 0)) {
        // Влезает при 20pt — добавляем
        slideParas.push(...block.paragraphs);
        blockIndex++;
      } else if (slideParas.length > 0) {
        // Не влезает при 20pt, но уже есть контент → переносим на следующий слайд
        break;
      } else {
        // Пустой слайд, блок слишком большой для 20pt → добавляем (рендерер уменьшит шрифт)
        slideParas.push(...block.paragraphs);
        blockIndex++;
        break;
      }
    }

    const slidePhotoIds = regularPhotos
      .slice(regularPhotoIndex, regularPhotoIndex + 2)
      .map(p => p.id);
    regularPhotoIndex += 2;

    coreSlides.push({
      id: uuid(),
      type: 'content',
      paragraphs: slideParas,
      photoIds: slidePhotoIds,
      orderIndex: coreSlides.length,
    });
  }

  // ─── Фаза 2: Вставляем полноэкранные фото через один контентный слайд ────
  // После каждого нечётного контентного слайда (1-го, 3-го, 5-го...) вставляем
  // одно fullscreen фото. Title и advantages не считаются.
  const slides: Slide[] = [];
  let fullscreenIdx = 0;
  let contentSlideCount = 0;

  for (const slide of coreSlides) {
    slides.push(slide);

    // Считаем контентные слайды (не title и не advantages)
    if (slide.type !== 'title' && slide.type !== 'advantages') {
      contentSlideCount++;

      // Вставляем fullscreen через один: после 1-го, 3-го, 5-го... контентного
      if (contentSlideCount % 2 === 1 && fullscreenIdx < fullscreenPhotos.length) {
        slides.push({
          id: uuid(),
          type: 'fullscreen',
          photoIds: [fullscreenPhotos[fullscreenIdx].id],
          orderIndex: slides.length,
        });
        fullscreenIdx++;
      }
    }
  }

  // Оставшиеся fullscreen-фото добавляем в конец (перед планировками)
  while (fullscreenIdx < fullscreenPhotos.length) {
    slides.push({
      id: uuid(),
      type: 'fullscreen',
      photoIds: [fullscreenPhotos[fullscreenIdx].id],
      orderIndex: slides.length,
    });
    fullscreenIdx++;
  }

  // ─── Фаза 3: Планировки — всегда последние ────────────────────────────────
  for (const photo of floorplanPhotos) {
    slides.push({
      id: uuid(),
      type: 'floorplan',
      photoIds: [photo.id],
      orderIndex: slides.length,
    });
  }

  // Перенумеровываем порядок
  slides.forEach((s, i) => { s.orderIndex = i; });

  return { slides, warnings };
}

import { Property, Photo, Slide, SlideType, LayoutResult } from 'shared';
import { LINE_HEIGHT_MM, CHARS_PER_LINE_CONTENT, CHARS_PER_LINE_FULLTEXT, PDF } from 'shared';

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
  if (curSection) {
    marginLines = 2 / LINE_HEIGHT_MM;  // CAPS-заголовок → маленький отступ
  } else if (curBulletHeader && nextBullet) {
    marginLines = 0;  // Заголовок списка → буллет: без отступа
  } else if (curBullet && nextBullet) {
    marginLines = 0;  // Буллет → буллет: без отступа
  } else if (curBullet || curBulletHeader) {
    marginLines = PARAGRAPH_MARGIN_LINES;  // Конец списка → полный отступ
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

// ─── Auto-split oversized paragraphs by sentence boundaries ─────────────────

/**
 * Если абзац не помещается на один слайд — разрезает его по границам предложений.
 * Каждый кусок гарантированно заканчивается полным предложением.
 */
function splitOversizedParagraphs(
  paragraphs: string[],
  charsPerLine: number,
  maxHeightMm: number
): string[] {
  const result: string[] = [];
  for (const para of paragraphs) {
    if (estimateHeightMm([para], charsPerLine) <= maxHeightMm) {
      result.push(para);
      continue;
    }
    // Разрезаем на предложения: точка/!/? после которых идёт пробел + заглавная буква
    // Не ломает "кв.м.", "т.д.", "д. 5" и подобные сокращения
    const sentences = para.match(/[^.!?]*(?:[.!?]+(?=\s+[А-ЯA-Z«"(•\-–—])|[.!?]+\s*$)/g);
    if (!sentences) {
      // Нет знаков препинания — пушим как есть (жадный алгоритм выдаст warning)
      result.push(para);
      continue;
    }
    // Жадная упаковка предложений в куски, влезающие на слайд
    let chunk = '';
    for (const sent of sentences) {
      const candidate = chunk + sent;
      if (chunk && estimateHeightMm([candidate], charsPerLine) > maxHeightMm) {
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
  const contentTextHeightMm = PDF.CONTENT_HEIGHT_MM * 0.75;
  const allParagraphs = splitOversizedParagraphs(
    rawParagraphs,
    CHARS_PER_LINE_CONTENT,
    contentTextHeightMm
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

  // ─── Слайды с контентом: жадный алгоритм ─────────────────────────────────
  let paraIndex = 0;

  while (paraIndex < allParagraphs.length || regularPhotoIndex < regularPhotos.length) {
    const remainingParas = allParagraphs.slice(paraIndex);
    const remainingPhotos = regularPhotos.slice(regularPhotoIndex);

    if (remainingParas.length === 0 && remainingPhotos.length === 0) break;

    // Если закончились абзацы, но фото ещё есть → Photo Grid слайды
    if (remainingParas.length === 0) {
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
    if (remainingPhotos.length === 0) {
      while (paraIndex < allParagraphs.length) {
        const slideParas: string[] = [];
        while (paraIndex < allParagraphs.length) {
          // Секционный заголовок (CAPS) всегда начинает НОВЫЙ слайд
          if (isSectionHeading(allParagraphs[paraIndex]) && slideParas.length > 0) break;
          const candidate = [...slideParas, allParagraphs[paraIndex]];
          const height = estimateHeightMm(candidate, CHARS_PER_LINE_FULLTEXT);
          if (height > contentTextHeightMm && slideParas.length > 0) break;
          slideParas.push(allParagraphs[paraIndex]);
          paraIndex++;
        }
        if (slideParas.length === 0) {
          slideParas.push(allParagraphs[paraIndex]);
          paraIndex++;
          warnings.push('Один из абзацев очень длинный и может не влезть на слайд.');
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

    // Есть и текст, и фото → Content слайд
    const slideParas: string[] = [];
    while (paraIndex < allParagraphs.length) {
      // Секционный заголовок (CAPS) всегда начинает НОВЫЙ слайд
      if (isSectionHeading(allParagraphs[paraIndex]) && slideParas.length > 0) break;
      const candidate = [...slideParas, allParagraphs[paraIndex]];
      const height = estimateHeightMm(candidate, CHARS_PER_LINE_CONTENT);
      if (height > contentTextHeightMm && slideParas.length > 0) break;
      slideParas.push(allParagraphs[paraIndex]);
      paraIndex++;
    }
    if (slideParas.length === 0) {
      slideParas.push(allParagraphs[paraIndex]);
      paraIndex++;
      warnings.push('Один из абзацев очень длинный и может не влезть на слайд.');
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

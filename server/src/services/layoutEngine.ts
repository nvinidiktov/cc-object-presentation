import { Property, Photo, Slide, SlideType, LayoutResult } from 'shared';
import { LINE_HEIGHT_MM, CHARS_PER_LINE_CONTENT, CHARS_PER_LINE_FULLTEXT, PDF } from 'shared';

const PARAGRAPH_MARGIN_LINES = PDF.PARAGRAPH_MARGIN_MM / LINE_HEIGHT_MM; // ≈0.33
import { v4 as uuid } from 'uuid';

// ─── Paragraph fitting ───────────────────────────────────────────────────────

/**
 * Оценивает количество строк, которые займёт абзац в колонке заданной ширины
 */
function estimateParagraphLines(paragraph: string, charsPerLine: number): number {
  if (!paragraph.trim()) return PARAGRAPH_MARGIN_LINES;
  const hardLines = paragraph.split('\n');
  let totalLines = 0;
  for (const line of hardLines) {
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  return totalLines + PARAGRAPH_MARGIN_LINES;
}

/**
 * Оценивает суммарную высоту массива абзацев в мм
 */
function estimateHeightMm(paragraphs: string[], charsPerLine: number): number {
  const totalLines = paragraphs.reduce(
    (sum, p) => sum + estimateParagraphLines(p, charsPerLine),
    0
  );
  return totalLines * LINE_HEIGHT_MM;
}

// ─── Main layout engine ──────────────────────────────────────────────────────

export function buildLayout(
  property: Property,
  photos: Photo[]
): LayoutResult {
  const warnings: string[] = [];

  // Разбиваем описание на абзацы (разделитель — пустая строка)
  const allParagraphs = property.description
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

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
  const contentTextHeightMm = PDF.CONTENT_HEIGHT_MM * 0.82;
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

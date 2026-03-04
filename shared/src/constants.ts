// ─── PDF Layout Constants (все размеры в мм) ─────────────────────────────────

export const PDF = {
  // Страница A4 ландшафт
  PAGE_WIDTH_MM: 297,
  PAGE_HEIGHT_MM: 210,

  // Поля (минимальные для максимума фото)
  MARGIN_TOP_MM: 6,
  MARGIN_BOTTOM_MM: 6,
  MARGIN_LEFT_MM: 8,
  MARGIN_RIGHT_MM: 6,

  // Рабочая область
  CONTENT_WIDTH_MM: 283,   // 297 - 8 - 6
  CONTENT_HEIGHT_MM: 198,  // 210 - 6 - 6

  // Колонки (контентный слайд)
  TEXT_COLUMN_WIDTH_MM: 136,
  COLUMN_GAP_MM: 8,
  PHOTO_COLUMN_WIDTH_MM: 139, // 283 - 136 - 8 = 139 (= GRID ширина!)

  // Фото (2 на слайде, такие же как в grid — широкие ~3:2)
  PHOTO_WIDTH_MM: 139,
  PHOTO_HEIGHT_MM: 96.5,   // (198 - 5) / 2 = 96.5mm; 139/96.5 ≈ 1.44:1 ≈ 3:2
  PHOTO_GAP_MM: 5,

  // Фото-сетка (4 фото 2×2, на всю ширину)
  GRID_PHOTO_WIDTH_MM: 139,   // (283 - 5) / 2
  GRID_PHOTO_HEIGHT_MM: 96.5, // (198 - 5) / 2
  GRID_GAP_MM: 5,

  // Цвета
  COLOR_TEXT: '#1A1A1A',
  COLOR_RED_ACCENT: '#8B1515',
  COLOR_PRICE_BADGE: '#8B1515',
  COLOR_TABLE_BG: '#F5F5F5',
  COLOR_BG: '#FFFFFF',

  // Колонки для ТИТУЛЬНОГО слайда
  TITLE_TEXT_WIDTH_MM: 136,
  TITLE_PHOTO_WIDTH_MM: 139,

  // Поля для полноэкранных слайдов (маленькие, но видимые)
  FULLSCREEN_PADDING_MM: 5,

  // Шрифты (pt) — крупные для A4 ландшафтной презентации
  FONT_FAMILY: "'Inter', Arial, sans-serif",
  FONT_SIZE_NAME: 36,        // Название объекта на титуле (CAPS)
  FONT_SIZE_BODY: 20,        // Текст описания на контентных слайдах
  FONT_SIZE_BODY_FULL: 21,   // Текст на слайдах без фото (чуть крупнее)
  FONT_SIZE_HEADING: 28,     // Заголовки ("ПРЕИМУЩЕСТВА" и пр.) — уменьшен, титул остаётся 36
  FONT_SIZE_TABLE_LABEL: 18, // Метки в таблице (Площадь, Этаж...)
  FONT_SIZE_TABLE_VALUE: 20, // Значения в таблице (45 м², 12 из 17...)
  FONT_SIZE_PRICE: 28,       // Стоимость в бейдже
  FONT_SIZE_BULLET: 20,      // Буллеты преимуществ
  FONT_SIZE_SUB: 20,         // Адрес, метро под названием
  FONT_SIZE_BODY_MIN: 16,    // Минимальный шрифт при авто-сжатии (Tier 5)
  LINE_HEIGHT: 1.2,          // Основной межстрочный интервал
  LINE_HEIGHT_COMPACT: 1.05, // Компактный (для крайнего Tier авто-сжатия)
  PARAGRAPH_MARGIN_MM: 8,    // Отступ между абзацами (≈ пустая строка при 20pt)
} as const;

// ─── Text fitting constants ──────────────────────────────────────────────────

// Приблизительная высота строки при font-size 20pt, line-height 1.2
// 20pt ≈ 7.06mm, × 1.2 = 8.47mm/строка
export const LINE_HEIGHT_MM = 8.5;

// Средняя ширина символа пропорционального Inter 20pt (кириллица)
// Inter чуть шире Arial: ~0.43 × em, em ≈ 7.06mm → ~3.05mm
export const CHAR_WIDTH_MM = 3.05;

// Вычисляем, сколько символов/строк влезает в текстовую колонку
export const MAX_LINES_CONTENT = Math.floor(PDF.CONTENT_HEIGHT_MM / LINE_HEIGHT_MM);
export const CHARS_PER_LINE_CONTENT = Math.floor(PDF.TEXT_COLUMN_WIDTH_MM / CHAR_WIDTH_MM); // ~46
export const CHARS_PER_LINE_FULLTEXT = Math.floor(PDF.CONTENT_WIDTH_MM / CHAR_WIDTH_MM);   // ~97

// ─── Utility: форматирование цены (разбивка по разрядам) ─────────────────────

/** Форматирует числа в строке: 15000000 → 15 000 000 */
export function formatPrice(price: string): string {
  return price.replace(/\d{4,}/g, (match) =>
    match.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  );
}

// ─── API endpoints ────────────────────────────────────────────────────────────

export const API_BASE = '/api';
export const API_ENDPOINTS = {
  PROPERTIES: `${API_BASE}/properties`,
  PROPERTY: (id: string) => `${API_BASE}/properties/${id}`,
  PHOTOS: (propertyId: string) => `${API_BASE}/properties/${propertyId}/photos`,
  PHOTO: (propertyId: string, photoId: string) => `${API_BASE}/properties/${propertyId}/photos/${photoId}`,
  PHOTO_REORDER: (propertyId: string) => `${API_BASE}/properties/${propertyId}/photos/reorder`,
  PDF: (propertyId: string) => `${API_BASE}/properties/${propertyId}/pdf`,
  LAYOUT: (propertyId: string) => `${API_BASE}/properties/${propertyId}/layout`,
} as const;

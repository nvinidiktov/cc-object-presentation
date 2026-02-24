// ─── Extra field (доп. строка в таблице первого слайда) ──────────────────────

export interface ExtraField {
  label: string;  // Метка, например "Застройщик"
  value: string;  // Значение, например "ПИК"
}

// ─── Property (карточка объекта) ────────────────────────────────────────────

export interface Property {
  id: string;
  // Поля для титульного слайда
  name: string;          // Название ЖК / объект
  address: string;       // Адрес
  metro: string;         // Метро
  price: string;         // Стоимость (строка: "6 500 000 ₽")
  area: string;          // Площадь ("45,2 м²")
  floor: string;         // Этаж ("12 из 17")
  finish: string;        // Отделка ("Под ключ")
  deliveryDate: string;  // Срок сдачи ("4 кв. 2025")
  extraFields: ExtraField[]; // Дополнительные строки для таблицы (незаполненные — не показываются)
  // Контент
  advantages: string[];  // Буллеты для слайда "Преимущества"
  description: string;   // Длинный текст с абзацами (через \n\n)
  // Мета
  createdAt: number;
  updatedAt: number;
}

export type PropertyCreate = Omit<Property, 'id' | 'createdAt' | 'updatedAt'>;
export type PropertyUpdate = Partial<PropertyCreate>;

// ─── Photo (фото объекта) ────────────────────────────────────────────────────

export type PhotoType = 'regular' | 'fullscreen' | 'floorplan';

export interface Photo {
  id: string;
  propertyId: string;
  filename: string;      // имя файла на диске
  originalName: string;  // оригинальное имя при загрузке
  type: PhotoType;
  orderIndex: number;
  width: number;
  height: number;
  createdAt: number;
}

// ─── Slide types (типы слайдов) ──────────────────────────────────────────────

export type SlideType =
  | 'title'        // Титульный: таблица параметров + 2 фото + бейдж цены
  | 'advantages'   // Преимущества: буллеты + 2 фото
  | 'content'      // Контентный: текст (абзацы) + 2 фото
  | 'fullscreen'   // Полноэкранное фото: 1 фото на весь слайд
  | 'floorplan'    // Планировка: 1 картинка на весь слайд
  | 'photo-grid'   // Фото-сетка: 4 фото 2×2, без текста
  | 'full-text';   // Только текст: на всю ширину, без фото

export interface Slide {
  id: string;
  type: SlideType;
  // Для 'title' — берётся из property полей
  // Для 'advantages' — берётся из property.advantages
  // Для 'content' — параграфы текста
  paragraphs?: string[];
  // Фото для этого слайда (id-шники)
  photoIds: string[];
  // Порядковый номер
  orderIndex: number;
}

// ─── Layout result ───────────────────────────────────────────────────────────

export interface LayoutResult {
  slides: Slide[];
  warnings: string[];
}

// ─── API response wrapper ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

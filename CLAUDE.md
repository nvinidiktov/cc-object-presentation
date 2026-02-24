# cc-object-presentation — Контекст проекта

## Что это
Веб-приложение для генерации PDF-презентаций объектов недвижимости. Агент вводит данные об объекте (название, адрес, фото, преимущества, описание), система генерирует PDF-слайды формата A4 landscape через Puppeteer.

## Стек
- **Monorepo pnpm** с workspaces: `shared/`, `server/`, `client/`
- **Frontend**: React + TypeScript + Vite, shadcn/ui, @dnd-kit (drag-and-drop), zustand, react-hook-form + zod
- **Backend**: Node.js + Express, Puppeteer (HTML→PDF), JSON-файлы как БД
- **Запуск**: `start.bat` или `pnpm dev` в корне

## Структура проекта
```
cc-object-presentation/
├── shared/src/
│   ├── constants.ts     ← ВСЕ константы PDF (размеры, шрифты, цвета)
│   ├── types.ts         ← TypeScript типы (Property, Slide, etc.)
│   └── index.ts         ← реэкспорт
├── server/src/
│   ├── services/
│   │   ├── layoutEngine.ts   ← алгоритм раскладки слайдов
│   │   └── pdfGenerator.ts   ← генерация HTML→PDF через Puppeteer
│   └── routes/...
├── client/src/
│   ├── components/
│   │   ├── SlidePreview.tsx    ← предпросмотр слайдов в браузере
│   │   ├── PropertyForm.tsx    ← форма редактирования объекта
│   │   ├── DescriptionEditor.tsx ← редактор описания с разбивкой на слайды
│   │   └── PhotoLibrary.tsx   ← библиотека фото с цветовыми группами
│   └── pages/
│       └── PropertyEdit.tsx   ← главная страница редактирования (с drag-and-drop слайдов)
└── CLAUDE.md
```

## Ключевые константы (shared/src/constants.ts)
```typescript
export const PDF = {
  PAGE_WIDTH_MM: 297, PAGE_HEIGHT_MM: 210,
  MARGIN_TOP_MM: 6, MARGIN_BOTTOM_MM: 6, MARGIN_LEFT_MM: 8, MARGIN_RIGHT_MM: 6,
  CONTENT_WIDTH_MM: 283, CONTENT_HEIGHT_MM: 198,
  TEXT_COLUMN_WIDTH_MM: 136, COLUMN_GAP_MM: 8, PHOTO_COLUMN_WIDTH_MM: 139,
  PHOTO_WIDTH_MM: 139, PHOTO_HEIGHT_MM: 96.5, PHOTO_GAP_MM: 5,
  GRID_PHOTO_WIDTH_MM: 139, GRID_PHOTO_HEIGHT_MM: 96.5, GRID_GAP_MM: 5,
  COLOR_TEXT: '#1A1A1A', COLOR_RED_ACCENT: '#8B1515', COLOR_PRICE_BADGE: '#CC0000',
  FULLSCREEN_PADDING_MM: 5,
  FONT_SIZE_NAME: 36, FONT_SIZE_BODY: 20, FONT_SIZE_BODY_FULL: 21,
  FONT_SIZE_HEADING: 36, FONT_SIZE_TABLE_LABEL: 18, FONT_SIZE_TABLE_VALUE: 20,
  FONT_SIZE_PRICE: 28, FONT_SIZE_BULLET: 20, FONT_SIZE_SUB: 20, LINE_HEIGHT: 1.5,
} as const;
export const LINE_HEIGHT_MM = 10.5;
export const CHAR_WIDTH_MM = 2.9; // Arial пропорциональный (не моноширинный!)
```

## Типы слайдов (layoutEngine.ts)
1. **title** — название + цена + таблица характеристик + фото справа
2. **advantages** — заголовок + буллеты преимуществ + фото справа
3. **content** — абзацы текста + фото справа
4. **full-text** — только текст на всю ширину (когда нет фото)
5. **photo-grid** — сетка из 2-4 фото
6. **fullscreen** — одно фото на весь слайд (вставляются между контентными слайдами)
7. **floorplan** — планировка (всегда последний слайд)

## Алгоритм layoutEngine (3 фазы)
- **Фаза 1**: строим основные слайды (title → advantages → content/full-text → photo-grid)
- **Фаза 2**: вставляем fullscreen фото после каждого нечётного контентного слайда
- **Фаза 3**: добавляем floorplan слайды в конец

## Важные детали реализации

### Преимущества (advantages)
- В UI хранятся как текст с `• ` префиксом на каждой строке
- `textToAdvantages()` стрипает `•` перед сохранением в JSON
- `advantagesToText()` добавляет `• ` при загрузке — иначе буллеты пропадают!
- Заголовок "Преимущества" находится ВНУТРИ text-col, не над slide-body

### Фото
- Размеры унифицированы: content фото = grid фото = 139×96.5mm
- TEXT_COLUMN_WIDTH_MM: 136mm (уменьшена чтобы photo колонка = 139mm)
- При 3 фото в grid: третье центрируется `grid-column: 1/-1; max-width: 50%`
- При 1 фото в колонке: центрируется вертикально

### Описание (DescriptionEditor)
- Overlay техника: прозрачный textarea + цветной фон + пунктирные разделители
- Показывает где будут границы слайдов в реальном времени
- Параграфы разделяются пустой строкой

### Форматирование цены
- `formatPrice()` добавляет пробелы как разделители тысяч: `15000000` → `15 000 000`
- Бейдж цены: `display:flex; align-items:center; justify-content:center`

### Предпросмотр (SlidePreview.tsx)
- PREVIEW_WIDTH = 520px (уменьшено для обзора)
- Drag-and-drop порядка слайдов через @dnd-kit в PropertyEdit.tsx

## Что сделано (последние сессии)
- ✅ Автосохранение с дебаунсом 1.5с
- ✅ Вставка из Google Docs (htmlToPlainText)
- ✅ Полноэкранный режим предпросмотра
- ✅ Детекция переполнения + авто-уменьшение шрифта
- ✅ Drag-and-drop порядка слайдов
- ✅ Цветовые группы фото в PhotoLibrary с текстовыми подсказками
- ✅ Fullscreen фото чередуются с контентными слайдами
- ✅ Планировка всегда последний слайд
- ✅ Унифицированные размеры фото (139mm)

## Что ещё нужно сделать (backlog)
- [ ] Единый редактор слайдов: перетаскивание фото между слайдами + инлайн-редактирование текста
- [ ] Проверить все изменения последних сессий в работающем приложении
- [ ] Возможно: Google Drive интеграция для хранения объектов

## Запуск
```bash
cd C:\Users\nvini\Documents\Cowork\cc-object-presentation
pnpm dev
# Открыть http://localhost:5173
```

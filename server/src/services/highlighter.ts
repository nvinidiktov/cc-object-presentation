import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const API_TIMEOUT = 45_000;
const BATCH_SIZE = 20;
const MAX_TEXT_LEN = 600;
const WORDS_PER_CHUNK = 40;

// ─── Header detection ────────────────────────────────────────────────────────

/**
 * Detects header lines: all-caps text or lines ending with ":"
 */
function isHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith(':')) return true;
  const letters = trimmed.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return true;
  }
  return false;
}

// ─── Chunk splitting ─────────────────────────────────────────────────────────

interface ChunkRef {
  chunk: string;         // exact substring of original paragraph
  paragraphIndex: number;
}

/**
 * Splits each paragraph into ~40-word chunks for even distribution.
 * Each chunk is an EXACT substring of the original paragraph.
 * Skips tiny trailing chunks (< 8 words).
 */
function chunkParagraphs(paragraphs: string[]): ChunkRef[] {
  const refs: ChunkRef[] = [];
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const text = paragraphs[pi];
    const wordRegex = /\S+/g;
    const words: { start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = wordRegex.exec(text)) !== null) {
      words.push({ start: m.index, end: m.index + m[0].length });
    }
    if (words.length === 0) continue;

    for (let wi = 0; wi < words.length; wi += WORDS_PER_CHUNK) {
      const batch = words.slice(wi, wi + WORDS_PER_CHUNK);
      // Skip tiny trailing chunks
      if (batch.length < 8 && wi > 0) continue;
      const chunk = text.substring(batch[0].start, batch[batch.length - 1].end);
      refs.push({ chunk, paragraphIndex: pi });
    }
  }
  return refs;
}

// ─── Highlight application ───────────────────────────────────────────────────

/**
 * Applies highlight spans. Skips phrases in header lines.
 * Falls back to case-insensitive match. Sorted by length desc to prevent nesting.
 */
function applyHighlights(text: string, phrases: string[]): string {
  const unique = [...new Set(phrases.filter(p => p && p.trim().length >= 2))];
  const sorted = unique.sort((a, b) => b.length - a.length);

  let result = text;
  const applied: string[] = [];

  for (const phrase of sorted) {
    if (applied.some(prev => prev.includes(phrase) || phrase.includes(prev))) continue;

    // Find phrase position (exact or case-insensitive)
    let idx = result.indexOf(phrase);
    if (idx < 0) {
      idx = result.toLowerCase().indexOf(phrase.toLowerCase());
    }
    if (idx < 0) {
      console.warn(`  HL miss: "${phrase}" not in "${text.substring(0, 60)}…"`);
      continue;
    }

    // Skip if phrase falls within a header line
    const lineStart = result.lastIndexOf('\n', idx) + 1;
    const lineEndPos = result.indexOf('\n', idx);
    const line = result.substring(lineStart, lineEndPos === -1 ? result.length : lineEndPos);
    if (isHeaderLine(line)) {
      continue;
    }

    const originalText = result.substring(idx, idx + phrase.length);
    result = result.substring(0, idx) + `<span class="kw">${originalText}</span>` + result.substring(idx + phrase.length);
    applied.push(phrase);
  }
  return result;
}

// ─── AI batch processing ─────────────────────────────────────────────────────

interface TextItem {
  text: string;
  n: number;
}

async function processBatch(openai: OpenAI, items: TextItem[]): Promise<string[][]> {
  try {
    const numbered = items
      .map((item, i) => {
        const truncated = item.text.length > MAX_TEXT_LEN
          ? item.text.substring(0, MAX_TEXT_LEN) + '…'
          : item.text;
        return `${i + 1}. (${item.n}) «${truncated}»`;
      })
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Ты — редактор элитных презентаций премиальной недвижимости. Выбираешь самую впечатляющую продающую фразу из каждого фрагмента текста.

ПРИОРИТЕТ выбора (от лучшего к обычному):
1. Бренды и имена дизайнеров (Miele, Rimadesio, Dorn Braht, Poliform, Crestron)
2. Премиальные материалы (натуральный мрамор, дубовый паркет, муранское стекло)
3. Превосходные качества (безупречная отделка, исключительный вид, высокие потолки)
4. Уникальные характеристики объекта (видовая терраса, мастер-спальня, панорамное остекление)

НЕ выбирай бытовые/общие фразы (обеденная зона, входная группа, жилой комплекс, зона кухни).
НЕ выбирай текст ЗАГЛАВНЫМИ БУКВАМИ (это заголовки).
Всегда копируй слова ТОЧНО как в тексте, включая падежные окончания.`,
        },
        {
          role: 'user',
          content: `Для каждого текста выбери указанное в скобках количество ключевых фраз.

ГЛАВНОЕ ПРАВИЛО — ДОСЛОВНОЕ КОПИРОВАНИЕ:
Фраза ОБЯЗАНА быть дословной копией части текста. НЕ меняй падежи, окончания, формы слов!

ПРИМЕРЫ:
Текст: «с эффективной планировкой и полноценной мастер-спальней»
✅ ПРАВИЛЬНО: ["эффективной планировкой"]
❌ НЕПРАВИЛЬНО: ["эффективная планировка"] — изменены окончания!

Текст: «панорамой Москвы и высокими потолками»
✅ ПРАВИЛЬНО: ["высокими потолками"]

ПРАВИЛА:
1. Фраза = 2–3 СВЯЗАННЫХ слова (прилагательное + существительное и т.п.)
2. Выбирай ВПЕЧАТЛЯЮЩИЕ фразы — бренды, роскошь, уникальные особенности
3. НЕ начинай/заканчивай предлогом/союзом (в, с, и, на, из, от, для, к, а, но, по, за)
4. НЕ выбирай текст ЗАГЛАВНЫМИ БУКВАМИ и заголовки с двоеточием

Верни JSON: { "results": [{"phrases": ["фраза"]}, ...] }
Количество elements results = ${items.length}.

Тексты:
${numbered}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('HL batch: empty AI response');
      return items.map(() => []);
    }

    const parsed = JSON.parse(content) as { results?: Array<{ phrases?: string[] }> };
    const results = parsed.results ?? [];

    for (let i = 0; i < results.length && i < items.length; i++) {
      const phrases = results[i]?.phrases;
      if (Array.isArray(phrases) && phrases.length > 0) {
        console.log(`  HL chunk ${i}: [${phrases.join(' | ')}]`);
      }
    }

    return results.map(r =>
      Array.isArray(r?.phrases)
        ? r.phrases.filter(p => typeof p === 'string' && p.trim().length >= 2)
        : [],
    );
  } catch (err) {
    console.warn(`HL batch error: ${(err as Error).message}`);
    return items.map(() => []);
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Highlights key phrases in paragraphs and advantages.
 *
 * Strategy:
 * - Paragraphs → split into ~40-word chunks → 1 phrase per chunk (even distribution)
 * - Advantages → 1 phrase each (no chunking)
 * - Headers are skipped (all-caps, lines ending with ":")
 * - Per-slide cap (max 3, evenly spaced) is enforced by pdfGenerator
 */
export async function highlightTexts(
  paragraphs: string[],
  advantages: string[],
): Promise<{ paragraphs: string[]; advantages: string[] }> {
  if (!OPENAI_API_KEY) {
    return { paragraphs, advantages };
  }

  if (paragraphs.length === 0 && advantages.length === 0) {
    return { paragraphs, advantages };
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: API_TIMEOUT });

    // Chunk paragraphs for even spatial distribution
    const chunks = chunkParagraphs(paragraphs);

    // Build items: each chunk → 1 phrase, each advantage → 1 phrase
    const items: TextItem[] = [
      ...chunks.map(c => ({ text: c.chunk, n: 1 })),
      ...advantages.map(a => ({ text: a, n: 1 })),
    ];

    console.log(`HL: ${items.length} items (${chunks.length} chunks from ${paragraphs.length}p + ${advantages.length}a)`);

    // Batch and process in parallel
    const batches: TextItem[][] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    const batchResults = await Promise.all(batches.map(b => processBatch(openai, b)));
    const allPhrases = batchResults.flat();

    // Apply chunk phrases back to their original paragraphs
    const highlightedParagraphs = [...paragraphs];
    for (let ci = 0; ci < chunks.length; ci++) {
      const { paragraphIndex } = chunks[ci];
      const phrases = allPhrases[ci];
      if (!phrases || phrases.length === 0) continue;
      highlightedParagraphs[paragraphIndex] = applyHighlights(
        highlightedParagraphs[paragraphIndex],
        phrases,
      );
    }

    // Apply advantage highlights
    const highlightedAdvantages = advantages.map((adv, i) => {
      const phrases = allPhrases[chunks.length + i];
      if (!phrases || phrases.length === 0) return adv;
      return applyHighlights(adv, phrases);
    });

    const applied = [...highlightedParagraphs, ...highlightedAdvantages]
      .filter(h => h.includes('<span')).length;
    console.log(`HL: ${applied}/${paragraphs.length + advantages.length} texts highlighted`);

    return {
      paragraphs: highlightedParagraphs,
      advantages: highlightedAdvantages,
    };
  } catch (err) {
    console.warn('HL skipped (error):', (err as Error).message);
    return { paragraphs, advantages };
  }
}

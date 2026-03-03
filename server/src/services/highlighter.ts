import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

/** Timeout per API call */
const API_TIMEOUT = 45_000;
/** Max items per single API call */
const BATCH_SIZE = 20;
/** Max chars of text sent to AI per item */
const MAX_TEXT_LEN = 600;

/**
 * How many phrases to request for a paragraph based on word count.
 * ~1 phrase per 30 words, min 1, max 3.
 */
function phrasesNeeded(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  return Math.min(3, Math.max(1, Math.ceil(words / 30)));
}

/**
 * Applies highlight spans for given phrases to text.
 * Sorted by length desc to prevent nested spans.
 * Falls back to case-insensitive match if exact match fails.
 */
function applyHighlights(text: string, phrases: string[]): string {
  const unique = [...new Set(phrases.filter(p => p && p.trim().length >= 2))];
  const sorted = unique.sort((a, b) => b.length - a.length);

  let result = text;
  const applied: string[] = [];

  for (const phrase of sorted) {
    if (applied.some(prev => prev.includes(phrase) || phrase.includes(prev))) continue;

    // Try exact match first
    let idx = result.indexOf(phrase);
    if (idx >= 0) {
      result = result.substring(0, idx) + `<span class="kw">${phrase}</span>` + result.substring(idx + phrase.length);
      applied.push(phrase);
      continue;
    }

    // Fallback: case-insensitive match
    const lowerResult = result.toLowerCase();
    const lowerPhrase = phrase.toLowerCase();
    idx = lowerResult.indexOf(lowerPhrase);
    if (idx >= 0) {
      const originalText = result.substring(idx, idx + phrase.length);
      result = result.substring(0, idx) + `<span class="kw">${originalText}</span>` + result.substring(idx + phrase.length);
      applied.push(phrase);
      continue;
    }

    // Debug: phrase not found at all
    console.warn(`  HL miss: "${phrase}" not in "${text.substring(0, 60)}…"`);
  }
  return result;
}

interface TextItem {
  text: string;
  n: number; // number of phrases to pick
}

/**
 * Sends a batch of text items to OpenAI.
 * Returns array of phrase arrays, one per item.
 */
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
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Ты — редактор продающих презентаций элитной недвижимости. Выделяешь самые яркие продающие фразы. Всегда копируй слова ТОЧНО как в тексте, включая падежные окончания.',
        },
        {
          role: 'user',
          content: `Для каждого текста выбери указанное в скобках количество ключевых фраз.

ГЛАВНОЕ ПРАВИЛО — ДОСЛОВНОЕ КОПИРОВАНИЕ:
Фраза ОБЯЗАНА быть дословной копией части текста. НЕ меняй падежи, окончания, формы слов!

ПРИМЕРЫ:
Текст: «с эффективной планировкой и полноценной мастер-спальней»
✅ ПРАВИЛЬНО: ["эффективной планировкой", "полноценной мастер-спальней"]
❌ НЕПРАВИЛЬНО: ["эффективная планировка", "полноценная мастер-спальня"] — изменены окончания!

Текст: «в просторной гостиной со столовой зоной»
✅ ПРАВИЛЬНО: ["просторной гостиной"]
❌ НЕПРАВИЛЬНО: ["просторная гостиная"] — изменён падеж!

Текст: «Невероятные виды на Кремль»
✅ ПРАВИЛЬНО: ["Невероятные виды"]

ПРАВИЛА ВЫБОРА:
1. Фраза = 2–3 СВЯЗАННЫХ по смыслу слова (прилагательное + существительное, и т.п.)
2. Выбирай самые ПРОДАЮЩИЕ, СТАТУСНЫЕ, ПРЕВОСХОДНЫЕ фразы
3. НЕ начинай/заканчивай фразу предлогом, союзом или частицей (в, с, и, на, из, от, для, к, а, но, же, по, за)

Верни JSON: { "results": [{"phrases": ["фраза1", ...]}, ...] }
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

    // Debug: log received phrases
    for (let i = 0; i < results.length && i < items.length; i++) {
      const phrases = results[i]?.phrases;
      if (Array.isArray(phrases) && phrases.length > 0) {
        console.log(`  HL item ${i}: [${phrases.join(' | ')}]`);
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

/**
 * Highlights key phrases in paragraphs and advantages.
 *
 * Strategy:
 * - Paragraphs: ceil(wordCount/30) phrases (min 1, max 3)
 * - Advantages: always 1 phrase each
 * - Per-slide cap (max 3) is enforced by pdfGenerator
 *
 * Falls back to original texts on any error or missing API key.
 */
export async function highlightTexts(
  paragraphs: string[],
  advantages: string[],
): Promise<{ paragraphs: string[]; advantages: string[] }> {
  if (!OPENAI_API_KEY) {
    return { paragraphs, advantages };
  }

  const allTexts = [...paragraphs, ...advantages];
  if (allTexts.length === 0) {
    return { paragraphs, advantages };
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: API_TIMEOUT });

    // Build items: paragraphs get dynamic count, advantages get 1
    const items: TextItem[] = [
      ...paragraphs.map(p => ({ text: p, n: phrasesNeeded(p) })),
      ...advantages.map(a => ({ text: a, n: 1 })),
    ];

    const totalPhrases = items.reduce((s, it) => s + it.n, 0);
    console.log(`HL: ${items.length} texts (${paragraphs.length}p + ${advantages.length}a), need ${totalPhrases} phrases`);

    // Batch and process in parallel
    const batches: TextItem[][] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    const batchResults = await Promise.all(batches.map(b => processBatch(openai, b)));
    const allPhrases = batchResults.flat();

    // Apply highlights to each text
    const highlighted = allTexts.map((text, i) => {
      const phrases = allPhrases[i];
      if (!phrases || phrases.length === 0) return text;
      return applyHighlights(text, phrases);
    });

    const applied = highlighted.filter(h => h.includes('<span')).length;
    console.log(`HL: ${applied}/${allTexts.length} texts highlighted`);

    return {
      paragraphs: highlighted.slice(0, paragraphs.length),
      advantages: highlighted.slice(paragraphs.length),
    };
  } catch (err) {
    console.warn('HL skipped (error):', (err as Error).message);
    return { paragraphs, advantages };
  }
}

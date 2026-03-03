import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

/** Timeout per API call */
const API_TIMEOUT = 45_000;
/** Max items per single API call */
const BATCH_SIZE = 20;
/** Max chars of text sent to AI per item (phrases picked from this prefix) */
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
 * Skips phrases that overlap with already-applied ones.
 */
function applyHighlights(text: string, phrases: string[]): string {
  const unique = [...new Set(phrases.filter(p => p && p.trim().length >= 2))];
  const sorted = unique.sort((a, b) => b.length - a.length);

  let result = text;
  const applied: string[] = [];

  for (const phrase of sorted) {
    if (applied.some(prev => prev.includes(phrase) || phrase.includes(prev))) continue;
    if (!result.includes(phrase)) continue;
    result = result.replace(phrase, `<span class="kw">${phrase}</span>`);
    applied.push(phrase);
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
          content: 'Ты — редактор продающих презентаций элитной недвижимости. Выделяешь самые яркие и убедительные продающие фразы.',
        },
        {
          role: 'user',
          content: `Для каждого текста выбери указанное в скобках количество ключевых фраз.

ПРАВИЛА ВЫБОРА ФРАЗ:
1. Фраза = ровно 2–3 СВЯЗАННЫХ по смыслу слова (прилагательное + существительное, или наречие + прилагательное и т.п.)
2. Фраза ОБЯЗАНА быть ТОЧНОЙ подстрокой исходного текста (без изменений регистра, окончаний)
3. Выбирай самые ПРОДАЮЩИЕ фразы — то, что делает объект привлекательным:
   • превосходные степени ("высококлассная отделка", "просторная гостиная")
   • уникальные особенности ("панорамный вид", "дизайнерский ремонт")
   • статусные характеристики ("элитный комплекс", "премиальная инфраструктура")

ЗАПРЕЩЕНО:
- Фраза НЕ МОЖЕТ начинаться или заканчиваться предлогом/союзом/частицей (в, с, и, на, из, от, для, к, а, но, же, по, за, о, до, без, при, со)
- НЕ выбирай общие слова ("зона кухни", "в квартире", "Полы с")
- НЕ выбирай числа и метраж отдельно ("32 кв.м.", "4-х комнатная")

Верни JSON: { "results": [{"phrases": ["фраза1", ...]}, ...] }
Количество элементов results = ${items.length}.

Тексты:
${numbered}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return items.map(() => []);

    const parsed = JSON.parse(content) as { results?: Array<{ phrases?: string[] }> };
    const results = parsed.results ?? [];
    return results.map(r =>
      Array.isArray(r?.phrases)
        ? r.phrases.filter(p => typeof p === 'string' && p.trim().length >= 2)
        : [],
    );
  } catch (err) {
    console.warn(`Highlighting batch error: ${(err as Error).message}`);
    return items.map(() => []);
  }
}

/**
 * Highlights key phrases in paragraphs and advantages.
 *
 * Strategy:
 * - Paragraphs: ceil(wordCount/30) phrases per paragraph (min 1, max 3)
 * - Advantages: always 1 phrase per advantage
 * - Per-slide cap (max 3) is enforced by pdfGenerator, not here
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
    console.log(`Highlighting: ${items.length} texts (${paragraphs.length} para + ${advantages.length} adv), requesting ${totalPhrases} phrases`);

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
    console.log(`Highlighting: ${applied}/${allTexts.length} texts got highlights`);

    return {
      paragraphs: highlighted.slice(0, paragraphs.length),
      advantages: highlighted.slice(paragraphs.length),
    };
  } catch (err) {
    console.warn('Highlighting skipped (outer error):', (err as Error).message);
    return { paragraphs, advantages };
  }
}

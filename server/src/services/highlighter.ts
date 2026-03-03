import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const WORDS_PER_CHUNK = 20;

/**
 * Splits text into chunks of ~N words, each chunk being an exact substring
 * of the original text (so phrases within chunks are also substrings of original).
 */
function splitIntoChunks(text: string, wordsPerChunk: number): string[] {
  const wordRegex = /\S+/g;
  const words: { start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    words.push({ start: match.index, end: match.index + match[0].length });
  }
  if (words.length === 0) return [];

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const batch = words.slice(i, i + wordsPerChunk);
    chunks.push(text.substring(batch[0].start, batch[batch.length - 1].end));
  }
  return chunks;
}

/**
 * Applies highlight spans to a text for given phrases.
 * - Sorts phrases by length desc to avoid nested spans.
 * - Skips phrase if it overlaps (is substring of / contains) an already-applied phrase.
 * - Each phrase highlighted only once (first occurrence).
 */
function applyHighlights(text: string, phrases: string[]): string {
  const unique = [...new Set(phrases.filter(p => p && p.trim().length >= 2))];
  const sorted = unique.sort((a, b) => b.length - a.length);

  let result = text;
  const applied: string[] = [];

  for (const phrase of sorted) {
    // Skip if overlaps with already applied phrase
    if (applied.some(prev => prev.includes(phrase) || phrase.includes(prev))) continue;
    if (!result.includes(phrase)) continue;
    result = result.replace(phrase, `<span class="kw">${phrase}</span>`);
    applied.push(phrase);
  }
  return result;
}

/**
 * Highlights key phrases across paragraphs and advantages.
 * Strategy: chunk every ~20 words → ask AI for 2 key phrases per chunk.
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
    // Build flat list of chunks, each referencing its source text index
    interface ChunkRef { chunk: string; textIndex: number }
    const chunkRefs: ChunkRef[] = [];

    for (let ti = 0; ti < allTexts.length; ti++) {
      const chunks = splitIntoChunks(allTexts[ti], WORDS_PER_CHUNK);
      for (const chunk of chunks) {
        chunkRefs.push({ chunk, textIndex: ti });
      }
    }

    if (chunkRefs.length === 0) {
      return { paragraphs, advantages };
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: 20_000 });

    const numberedChunks = chunkRefs
      .map((cr, i) => `${i + 1}. «${cr.chunk}»`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Ты — редактор коммерческих презентаций недвижимости. Выделяешь продающие ключевые фразы в тексте.',
        },
        {
          role: 'user',
          content: `Для каждого фрагмента текста выбери ровно 2 ключевые фразы (1-3 слова каждая), которые:
- являются ТОЧНЫМИ подстроками фрагмента (без изменений регистра и окончаний)
- наиболее привлекательны и убедительны для покупателя недвижимости
- не повторяются в рамках одного фрагмента

Верни JSON: { "results": [{"phrases": ["фраза1", "фраза2"]}, ...] }
Количество элементов results = ${chunkRefs.length}.

Фрагменты:
${numberedChunks}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('Highlighting: empty response from AI');
      return { paragraphs, advantages };
    }

    const parsed = JSON.parse(content) as { results?: Array<{ phrases?: string[] }> };
    const results = parsed.results;

    if (!Array.isArray(results) || results.length === 0) {
      console.warn('Highlighting: invalid AI response format');
      return { paragraphs, advantages };
    }

    // Group all phrases by original text index
    const phrasesByText = new Map<number, string[]>();
    const limit = Math.min(results.length, chunkRefs.length);
    for (let i = 0; i < limit; i++) {
      const { textIndex } = chunkRefs[i];
      const phrases = results[i]?.phrases;
      if (Array.isArray(phrases) && phrases.length > 0) {
        if (!phrasesByText.has(textIndex)) phrasesByText.set(textIndex, []);
        phrasesByText.get(textIndex)!.push(...phrases);
      }
    }

    // Apply highlights to each original text
    const highlighted = allTexts.map((text, i) => {
      const phrases = phrasesByText.get(i);
      if (!phrases || phrases.length === 0) return text;
      return applyHighlights(text, phrases);
    });

    return {
      paragraphs: highlighted.slice(0, paragraphs.length),
      advantages: highlighted.slice(paragraphs.length),
    };
  } catch (err) {
    console.warn('Highlighting skipped (AI error):', (err as Error).message);
    return { paragraphs, advantages };
  }
}

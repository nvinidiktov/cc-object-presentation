import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

/** Words per chunk — every ~20 words → 2 key phrases */
const WORDS_PER_CHUNK = 20;
/** Max chunks per single API call — keeps each request fast */
const BATCH_SIZE = 25;
/** Timeout per API call in ms */
const API_TIMEOUT = 35_000;

interface ChunkRef {
  chunk: string;
  textIndex: number;
}

/**
 * Splits text into chunks of ~N words.
 * Each chunk is an EXACT substring of the original text (no word-splitting artefacts).
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
 * Applies highlight spans for given phrases to text.
 * Sorted by length desc to avoid nested spans on overlapping phrases.
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

/**
 * Sends one batch of chunks to OpenAI and returns phrases per chunk.
 * Returns empty arrays on error (graceful degradation).
 */
async function processBatch(openai: OpenAI, batch: ChunkRef[]): Promise<string[][]> {
  try {
    const numbered = batch.map((cr, i) => `${i + 1}. «${cr.chunk}»`).join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Ты — редактор коммерческих презентаций недвижимости. Выделяешь продающие ключевые фразы.',
        },
        {
          role: 'user',
          content: `Для каждого фрагмента выбери ровно 2 ключевые фразы (1-3 слова каждая), которые:
- являются ТОЧНЫМИ подстроками фрагмента (без изменений регистра и окончаний)
- наиболее привлекательны и убедительны для покупателя недвижимости
- не повторяются в рамках одного фрагмента

Верни JSON: { "results": [{"phrases": ["фраза1", "фраза2"]}, ...] }
Количество elements results = ${batch.length}.

Фрагменты:
${numbered}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return batch.map(() => []);

    const parsed = JSON.parse(content) as { results?: Array<{ phrases?: string[] }> };
    const results = parsed.results ?? [];
    return results.map(r => (Array.isArray(r?.phrases) ? r.phrases.filter(p => typeof p === 'string' && p.length > 1) : []));
  } catch (err) {
    console.warn(`Highlighting batch error: ${(err as Error).message}`);
    return batch.map(() => []);
  }
}

/**
 * Highlights key phrases in paragraphs and advantages.
 * Strategy: chunk every ~20 words → 2 phrases per chunk, processed in parallel batches.
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

    console.log(`Highlighting: ${chunkRefs.length} chunks across ${allTexts.length} texts`);

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: API_TIMEOUT });

    // Split into batches and process in parallel
    const batches: ChunkRef[][] = [];
    for (let i = 0; i < chunkRefs.length; i += BATCH_SIZE) {
      batches.push(chunkRefs.slice(i, i + BATCH_SIZE));
    }

    console.log(`Highlighting: ${batches.length} batches, sending in parallel...`);

    const batchResults = await Promise.all(batches.map(b => processBatch(openai, b)));

    // Flatten: batchResults[i][j] = phrases for chunk at position (i*BATCH_SIZE + j)
    const allPhrasesPerChunk = batchResults.flat();

    // Group all collected phrases by original text index
    const phrasesByText = new Map<number, string[]>();
    const limit = Math.min(allPhrasesPerChunk.length, chunkRefs.length);
    for (let i = 0; i < limit; i++) {
      const { textIndex } = chunkRefs[i];
      const phrases = allPhrasesPerChunk[i];
      if (phrases.length > 0) {
        if (!phrasesByText.has(textIndex)) phrasesByText.set(textIndex, []);
        phrasesByText.get(textIndex)!.push(...phrases);
      }
    }

    const totalHighlighted = Array.from(phrasesByText.values()).reduce((s, arr) => s + arr.length, 0);
    console.log(`Highlighting: applied ${totalHighlighted} phrases across ${phrasesByText.size} texts`);

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
    console.warn('Highlighting skipped (outer error):', (err as Error).message);
    return { paragraphs, advantages };
  }
}

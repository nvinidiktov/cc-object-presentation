import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

/**
 * Выделяет ключевые фразы в тексте, оборачивая их в <span class="kw">.
 * Если API-ключ отсутствует или происходит ошибка — возвращает тексты без изменений.
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
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY, timeout: 10_000 });

    // Нумерованный список текстов (обрезаем до 300 символов для экономии токенов)
    const numberedTexts = allTexts
      .map((t, i) => `${i + 1}. «${t.substring(0, 300)}»`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Ты — редактор коммерческих презентаций недвижимости. Твоя задача — выделить ключевые продающие фразы в тексте.',
        },
        {
          role: 'user',
          content: `Для каждого текста ниже выбери ровно ОДНУ ключевую фразу (2-3 слова), которая:
- наиболее привлекательна для покупателя
- является ТОЧНОЙ подстрокой исходного текста (без изменений регистра, окончаний)
- не является общим словом ("квартира", "район"), а конкретным преимуществом

Верни JSON: { "phrases": ["фраза1", "фраза2", ...] }
Количество фраз = ${allTexts.length}.

Тексты:
${numberedTexts}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('Highlighting: пустой ответ от AI');
      return { paragraphs, advantages };
    }

    const parsed = JSON.parse(content) as { phrases?: string[] };
    const phrases = parsed.phrases;

    if (!Array.isArray(phrases) || phrases.length === 0) {
      console.warn(`Highlighting: невалидный ответ от AI`);
      return { paragraphs, advantages };
    }

    // Применяем подсветку (если AI вернул больше/меньше фраз — берём что есть)
    const highlighted = allTexts.map((text, i) => applyHighlight(text, phrases[i] ?? ''));

    return {
      paragraphs: highlighted.slice(0, paragraphs.length),
      advantages: highlighted.slice(paragraphs.length),
    };
  } catch (err) {
    console.warn('Highlighting skipped (AI error):', (err as Error).message);
    return { paragraphs, advantages };
  }
}

/** Оборачивает первое вхождение фразы в <span class="kw"> */
function applyHighlight(text: string, phrase: string): string {
  if (!phrase || !text.includes(phrase)) return text;
  return text.replace(phrase, `<span class="kw">${phrase}</span>`);
}

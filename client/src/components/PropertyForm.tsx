import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PropertyCreate } from 'shared';
import { Plus, X, Check, Loader2 } from 'lucide-react';
import React, { useEffect, useRef, useCallback, useState } from 'react';

// ─── Validation schema ────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Укажите название объекта'),
  address: z.string().default(''),
  metro: z.string().default(''),
  price: z.string().default(''),
  area: z.string().default(''),
  floor: z.string().default(''),
  finish: z.string().default(''),
  deliveryDate: z.string().default(''),
  extraFields: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  advantagesText: z.string().default(''),
  description: z.string().default(''),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  defaultValues?: Partial<PropertyCreate>;
  onSubmit: (values: PropertyCreate) => void | Promise<void>;
  isLoading?: boolean;
  submitLabel?: string;
  autoSave?: boolean; // true = автосохранение (режим редактирования), false = кнопка сабмит
}

function advantagesToText(arr: string[]): string {
  // Добавляем маркер •, чтобы при перезагрузке буллеты были видны в textarea
  return arr.map(a => `• ${a}`).join('\n');
}

function textToAdvantages(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    // Убираем маркеры буллетов (•, ‣, ▸, -, *, ·) — в PDF они добавляются через list-style
    .map(line => line.replace(/^[•‣▸\-*·]\s*/, ''));
}

/**
 * Парсит HTML из буфера обмена (Google Docs, Word) в plain text.
 * - <li> → строки с маркером •
 * - <p>, <div>, <h1>-<h6> → отдельные строки
 * - <br> → перенос строки
 */
function htmlToPlainText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const lines: string[] = [];

  function walkNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, ' ') ?? '';
      if (text.trim()) lines.push(text.trim());
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'li') {
      const text = el.textContent?.trim() ?? '';
      // Всегда добавляем маркер • для элементов списка
      if (text) lines.push(`• ${text}`);
      return;
    }
    if (tag === 'br') {
      lines.push('');
      return;
    }
    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      const text = el.textContent?.trim() ?? '';
      if (text) lines.push(text);
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      walkNode(child);
    }
  }

  walkNode(doc.body);
  return lines.join('\n');
}

export default function PropertyForm({
  defaultValues,
  onSubmit,
  isLoading,
  submitLabel = 'Сохранить',
  autoSave = false,
}: Props) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      address: defaultValues?.address ?? '',
      metro: defaultValues?.metro ?? '',
      price: defaultValues?.price ?? '',
      area: defaultValues?.area ?? '',
      floor: defaultValues?.floor ?? '',
      finish: defaultValues?.finish ?? '',
      deliveryDate: defaultValues?.deliveryDate ?? '',
      extraFields: defaultValues?.extraFields ?? [],
      advantagesText: advantagesToText(defaultValues?.advantages ?? []),
      description: defaultValues?.description ?? '',
    },
  });

  const { fields: extraFields, append: appendExtra, remove: removeExtra } = useFieldArray({
    control,
    name: 'extraFields',
  });

  // ─── Auto-save с debounce 1.5 секунды ─────────────────────────────────────

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);

  const doSave = useCallback(() => {
    const values = getValues();
    if (!values.name?.trim()) return; // не сохраняем без названия

    setSaveStatus('saving');
    const result: PropertyCreate = {
      name: values.name,
      address: values.address,
      metro: values.metro,
      price: values.price,
      area: values.area,
      floor: values.floor,
      finish: values.finish,
      deliveryDate: values.deliveryDate,
      extraFields: values.extraFields.filter(f => f.label.trim() || f.value.trim()),
      advantages: textToAdvantages(values.advantagesText),
      description: values.description,
    };

    Promise.resolve(onSubmit(result)).then(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    });
  }, [getValues, onSubmit]);

  // Подписываемся на ВСЕ изменения формы (только в режиме autoSave)
  useEffect(() => {
    if (!autoSave) return;
    const subscription = watch(() => {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(doSave, 1500);
    });
    return () => {
      subscription.unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [watch, doSave, autoSave]);

  // ─── Manual submit (для режима создания) ─────────────────────────────
  const handleFormSubmit = (values: FormValues) => {
    const result: PropertyCreate = {
      name: values.name,
      address: values.address,
      metro: values.metro,
      price: values.price,
      area: values.area,
      floor: values.floor,
      finish: values.finish,
      deliveryDate: values.deliveryDate,
      extraFields: values.extraFields.filter(f => f.label.trim() || f.value.trim()),
      advantages: textToAdvantages(values.advantagesText),
      description: values.description,
    };
    return onSubmit(result);
  };

  // ─── Paste handler ────────────────────────────────────────────────────────

  const handlePaste = useCallback((
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    fieldName: 'advantagesText' | 'description',
  ) => {
    const html = e.clipboardData.getData('text/html');
    if (!html) return; // plain text — пусть браузер обработает сам

    e.preventDefault();
    const plainText = htmlToPlainText(html);

    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = getValues(fieldName);
    const newValue = current.substring(0, start) + plainText + current.substring(end);

    setValue(fieldName, newValue, { shouldDirty: true });

    // Обновляем DOM напрямую (react-hook-form register = uncontrolled)
    textarea.value = newValue;
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + plainText.length;
    });
  }, [setValue, getValues]);

  const formContent = (
    <div className="space-y-8">

      {/* ─── Статус сохранения (только в режиме autoSave) ─────────────────── */}
      {autoSave && (
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 -mx-4 px-4 py-2 flex items-center justify-end gap-2 text-sm">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Сохранение...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-green-600">
              <Check className="w-3.5 h-3.5" /> Сохранено
            </span>
          )}
          {saveStatus === 'idle' && (
            <span className="text-gray-400 text-xs">Автосохранение включено</span>
          )}
        </div>
      )}

      {/* ─── Основная информация ─────────────────────────────────────────────── */}
      <section className="card p-6 space-y-5">
        <h2 className="font-semibold text-gray-900 text-base border-b border-gray-100 pb-3">
          Основная информация
        </h2>

        <div>
          <label className="label">Название ЖК / Объект *</label>
          <input
            {...register('name')}
            className="input"
            placeholder="ЖК Мечта Олигарха"
          />
          {errors.name && <p className="field-error">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Адрес</label>
            <input {...register('address')} className="input" placeholder="ул. Примерная, 1" />
          </div>
          <div>
            <label className="label">Метро</label>
            <input {...register('metro')} className="input" placeholder="Новогиреево" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="label">Стоимость</label>
            <input {...register('price')} className="input" placeholder="6 500 000 ₽" />
          </div>
          <div>
            <label className="label">Площадь</label>
            <input {...register('area')} className="input" placeholder="45,2 м²" />
          </div>
          <div>
            <label className="label">Этаж</label>
            <input {...register('floor')} className="input" placeholder="12 из 17" />
          </div>
          <div>
            <label className="label">Отделка</label>
            <input {...register('finish')} className="input" placeholder="Под ключ" />
          </div>
          <div>
            <label className="label">Срок сдачи</label>
            <input {...register('deliveryDate')} className="input" placeholder="4 кв. 2025" />
          </div>
        </div>

        {/* ─── Дополнительные поля ──────────────────────────────────────────── */}
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Дополнительные поля</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Незаполненные поля на слайде не появятся
              </p>
            </div>
            <button
              type="button"
              onClick={() => appendExtra({ label: '', value: '' })}
              className="btn-secondary text-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Добавить поле
            </button>
          </div>

          {extraFields.length === 0 && (
            <p className="text-xs text-gray-400 italic">
              Например: Застройщик, Класс жилья, Высота потолков, Паркинг...
            </p>
          )}

          <div className="space-y-2">
            {extraFields.map((field, i) => (
              <div key={field.id} className="flex gap-2 items-center">
                <input
                  {...register(`extraFields.${i}.label`)}
                  className="input w-36 flex-shrink-0"
                  placeholder="Метка"
                />
                <input
                  {...register(`extraFields.${i}.value`)}
                  className="input flex-1"
                  placeholder="Значение"
                />
                <button
                  type="button"
                  onClick={() => removeExtra(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Преимущества ────────────────────────────────────────────────────── */}
      <section className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-base border-b border-gray-100 pb-3">
          Преимущества
          <span className="ml-2 text-xs font-normal text-gray-400">
            (буллеты на слайде 2)
          </span>
        </h2>

        <textarea
          {...register('advantagesText')}
          className="input resize-none font-mono text-sm"
          rows={8}
          placeholder={"• Панорамные виды на Москву-реку\n• Закрытый двор без машин\n• Подземный паркинг\n• Консьерж 24/7\n• Фитнес-центр в доме"}
          onPaste={e => handlePaste(e, 'advantagesText')}
        />
        <p className="text-xs text-gray-400">
          Вставьте весь список из Google Docs / Word — буллеты сохранятся.
          Каждая строка станет отдельным пунктом.
        </p>
      </section>

      {/* ─── Описание объекта ─────────────────────────────────────────────────── */}
      <section className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-base border-b border-gray-100 pb-3">
          Описание объекта
          <span className="ml-2 text-xs font-normal text-gray-400">
            (текст по слайдам — разбивка обновляется в реальном времени)
          </span>
        </h2>

        <p className="text-xs text-gray-400 mb-2">
          Разделяйте абзацы пустой строкой.
          Вставка из Google Docs / Word — форматирование сохранится.
          Разбивку по слайдам увидите во вкладке «Редактор слайдов».
        </p>
        <textarea
          {...register('description')}
          className="input resize-none font-mono text-sm"
          rows={12}
          placeholder="Опишите объект. Каждый абзац, разделённый пустой строкой, будет распределён по слайдам."
          onPaste={e => handlePaste(e, 'description')}
        />
      </section>

      {/* ─── Кнопка сабмит (только в режиме создания) ─────────────────────── */}
      {!autoSave && (
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Сохранение...
              </span>
            ) : submitLabel}
          </button>
        </div>
      )}
    </div>
  );

  // В режиме autoSave — просто div, в режиме создания — form с onSubmit
  if (autoSave) {
    return formContent;
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      {formContent}
    </form>
  );
}

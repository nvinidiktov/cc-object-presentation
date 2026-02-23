﻿﻿# Стартовый Промпт Для Claude/Cowork

Скопируй текст ниже в первый запрос другой системе:

```text
Работай строго в этой папке.
Сначала один раз выполни baseline-настройку UTF-8:
powershell -ExecutionPolicy Bypass -File tools/setup_utf8_windows.ps1
После этого перезапусти терминал.

Сначала запусти нормализацию кодировки документов:
powershell -ExecutionPolicy Bypass -File tools/normalize_docs_encoding.ps1 -Root .

Перед началом обязательно прочитай документы в порядке:
1) research/object_presentation_tz/MASTER_SPEC_v2.md
2) research/object_presentation_tz/00_README_START_HERE.md
3) research/object_presentation_tz/TZ_v5_master_spec.md
4) research/object_presentation_tz/IMPLEMENTATION_AUTOPILOT.md
5) research/object_presentation_tz/SUBAGENTS_WORKFLOW.md
6) research/object_presentation_tz/UNICODE_POLICY.md
7) research/object_presentation_tz/DEPENDENCIES_AND_API.md
8) research/object_presentation_tz/API_SETUP_POWERSHELL.md
9) research/object_presentation_tz/BEST_PRACTICE_DECISIONS.md
10) research/object_presentation_tz/DecisionLog.md

Ключевые правила:
- Главный стандарт: MASTER_SPEC_v2.md
- Формат слайда строго A4 альбомный (29.7 x 21.0 см)
- Слайд 2 обязательно «Преимущества»
- Экспорт PDF обязателен, после изменений делать проверочный экспорт
- Режим автопилота по Gate A-H, стоп только при критическом блокере
- Можно использовать готовые внешние модули (npm/GitHub), если это ускоряет разработку и не снижает качество; версии фиксировать, решения логировать
- Делать реализацию с нуля по ТЗ (не использовать старый код как baseline)

После каждого Gate:
- что сделано
- какие тесты запущены
- какие риски
- что дальше
```

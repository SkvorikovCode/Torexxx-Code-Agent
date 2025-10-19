# Torexxx Agent (CLI)

Красивый CLI‑агент в стиле "Claude Code", который:
- принимает задачу на написание кода;
- нормализует промт через OpenRouter;
- генерирует проект по строгому FILE‑формату;
- поддерживает пулы моделей и последовательные фолбэки;
- печатает стрим‑ответ (с авто‑фолбэком на нестрим);
- сохраняет артефакты в `Torexxx-Agent/projects/*`.

## Требования
- Node.js >= 18
- Аккаунт OpenRouter и ключ API `OPENROUTER_API_KEY`

## Установка и запуск
Внутри папки проекта:

```bash
npm install
node ./bin/torexxx-agent.js new
```

По умолчанию ввод — простой `input` в терминале. Для многострочного ТЗ используйте `--editor`:

```bash
node ./bin/torexxx-agent.js new --editor
```

Либо передайте задачу сразу:

```bash
node ./bin/torexxx-agent.js new --prompt "Сделай веб‑сервер на Node.js с кнопкой и счётом кликов"
```

Приоритет настроек: флаги CLI > переменные окружения.

## Использование .env
CLI автоматически загружает переменные из `.env` и `.env.local` в корне проекта (значения из `.env.local` перекрывают `.env`). Скопируйте `.env.example` в `.env` и заполните ключ.

Примеры запуска с OpenRouter:

```bash
# Через .env
# OPENROUTER_API_KEY=...
node ./bin/torexxx-agent.js new

# Через экспорт в shell + одиночные модели
export OPENROUTER_API_KEY=your_api_key_here
node ./bin/torexxx-agent.js new \
  --model-refine qwen/qwen3-coder:free \
  --model-codegen qwen/qwen3-coder:free

# Пулы моделей (через запятую, порядок важен)
node ./bin/torexxx-agent.js new \
  --models-refine "qwen/qwen3-coder:free,mistralai/mistral-small:free" \
  --models-codegen "qwen/qwen3-coder:free,mistralai/mistral-small:free"
```

### Переменные окружения
- `OPENROUTER_API_KEY` — ключ OpenRouter (обязателен).
- `OPENROUTER_EMBEDDED_KEY` — встроенный ключ для закрытых сборок (альтернатива, используется если `OPENROUTER_API_KEY` пуст).
- `OPENROUTER_BASE_URL` — базовый URL OpenRouter (по умолчанию `https://openrouter.ai/api/v1`).
- `OPENROUTER_REFERER` — HTTP Referer (рекомендовано).
- `OPENROUTER_TITLE` — заголовок приложения (рекомендовано).
- `OR_MODEL_REFINE` / `OR_MODEL_CODEGEN` — одиночные модели.
- `OR_MODEL_REFINE_FALLBACK` — фолбэк для нормализации.
- `OR_MODEL_CODEGEN_FALLBACK` — фолбэк для кодогенерации.
- `OR_MODELS_REFINE` — пул моделей для нормализации (первая — основная).
- `OR_MODELS_CODEGEN` — пул моделей для кодогенерации (первая — основная).
- `OPENROUTER_MODEL_FALLBACK` — общий фолбэк на случай недоступности (добавляется в конец пулов).
- `OPENROUTER_RETRY_MS` — задержка перед повтором при 429 (мс, по умолчанию `2000`).

Примечание: если задан `OR_MODELS_*`, он имеет приоритет над одиночными `OR_MODEL_*`. Одиночные переменные можно оставить для читаемости (совпадают с первой моделью в пуле) или убрать.

## Лимиты и фолбэки моделей
- Последовательный пул: если основная модель падает по любой причине (429, 403, несовместимость формата, сетевые ошибки), автоматически пробуем следующую из списка.
- 429 (rate limit): возможен повтор после `OPENROUTER_RETRY_MS`, затем переход к следующей модели/фолбэку.
- 403 (region‑restricted): автоматический фолбэк к безопасной альтернативе (например, `qwen/qwen3-coder:free`).
- response_format: некоторые модели (например, Meta Llama) отвергают `response_format`. Запрос повторяется без него.
- Стрим‑фолбэк: если стриминг SSE даёт ошибку, агент автоматически повторит запрос той же модели без стрима.
- Диагностика: при полной неудаче выводится сводка причин по всем попыткам.

## Рекомендованные бесплатные модели
- Базовая пара: `qwen/qwen3-coder:free` (основная) + `mistralai/mistral-small:free` (фолбэк).
- Полный список и рекомендации см. в `free-models.md`.

Настройка пулов через `.env`:

```env
OR_MODELS_REFINE=qwen/qwen3-coder:free,mistralai/mistral-small:free
OR_MODELS_CODEGEN=qwen/qwen3-coder:free,mistralai/mistral-small:free
OR_MODEL_REFINE=qwen/qwen3-coder:free
OR_MODEL_CODEGEN=qwen/qwen3-coder:free
OR_MODEL_REFINE_FALLBACK=mistralai/mistral-small:free
OR_MODEL_CODEGEN_FALLBACK=mistralai/mistral-small:free
OPENROUTER_RETRY_MS=2000
```

## Что сохраняется
- `prompt.original.txt` — исходная формулировка задачи.
- `prompt.refined.json` — очищенный бриф/ТЗ.
- `generation.raw.md` — полный потоковый ответ модели.
- Сгенерированные файлы проекта по блокам `<<<FILE: ...>>>`.
- `meta.json` — метаданные о генерации.

Пути сохраняются в `Torexxx-Agent/projects/<timestamp>-<slug>`.

## Формат ответа модели
Агент ожидает строгий формат для каждого файла:

```
<<<FILE: relative/path>>>
```<lang or text>
...content...
```
<<<END FILE>>>
```

Требования:
- никаких префиксов/пояснений вне FILE‑блоков;
- каждый файл строго внутри тройных бэктиков;
- допустимы заголовки `<<<FILE: ...>>>` и `<<<FILE: ...>>` (оба распознаются);
- добавляйте `README.md` с инструкциями, при необходимости `package.json`/`requirements.txt`.

## Запуск сгенерированного проекта
- Откройте сохранённую папку проекта и следуйте инструкциям в `README.md` внутри.
- Для Node.js проектов обычно:

```bash
cd Torexxx-Agent/projects/<timestamp>-<slug>
npm install
npm run dev # или node index.js
```

## Установка как полноценного CLI
- Dev‑линковка:
  - `npm run link` в корне проекта.
  - Запуск: `torexxx-agent new` из любой директории.
- Публикация (после выхода пакета):
  - `npm i -g torexxx-agent` или `npx torexxx-agent new`.
- Сборка бинарников:
  - macOS: `npm run build:mac` → `dist/torexxx-agent-x64`, `dist/torexxx-agent-arm64`.
  - Windows: `npm run build:win` → `dist/torexxx-agent.exe`.
  - Все сразу: `npm run build:all`.

## Примечания
- Для OpenRouter требуется валидный ключ: установите `OPENROUTER_API_KEY` или используйте `OPENROUTER_EMBEDDED_KEY`.
- Пулы моделей лучше всего начинать с надёжной пары: `qwen/qwen3-coder:free` → `mistralai/mistral-small:free`.
- В терминале есть стриминг токенов и уведомления о старте новых файлов в потоке.
- При ошибках смотрите `generation.raw.md` и список причин в сообщении об ошибке (агент собирает их по всем попыткам).
# Torexxx Agent (CLI)

Красивый CLI агент в стиле "Claude Code", который:
- принимает задачу на написание кода;
- нормализует промт через OpenRouter;
- генерирует код через модели OpenRouter;
- сохраняет артефакты и файлы в `Torexxx-Agent/projects/*`.

## Требования
- Node.js >= 18
- Аккаунт OpenRouter и ключ API `OPENROUTER_API_KEY`

## Установка и запуск
Внутри папки проекта:

```bash
npm install
node ./bin/torexxx-agent.js new
```

По умолчанию ввод — простой `input` в терминале. Для многострочного ТЗ используйте флаг `--editor`:

```bash
node ./bin/torexxx-agent.js new --editor
```

Или сразу передать задачу без интерактива:

```bash
node ./bin/torexxx-agent.js new --prompt "Сделай веб-сервер на Node.js с кнопкой и счётом кликов"
```

Приоритет источников настроек: флаги CLI > переменные окружения.

### Использование .env
CLI автоматически загружает переменные из файлов `.env` и `.env.local` в корне проекта (значения из `.env.local` перекрывают `.env`). Пример: скопируйте `.env.example` в `.env` и заполните значения.

Использование с OpenRouter:

```bash
# Вариант 1: через .env
# OPENROUTER_API_KEY=...
node ./bin/torexxx-agent.js new

# Вариант 2: экспорт в shell
export OPENROUTER_API_KEY=your_api_key_here
node ./bin/torexxx-agent.js new \
  --model-refine qwen/qwen3-coder:free \
  --model-codegen qwen/qwen3-coder:free

# Пулы моделей (через запятую, порядок важен)
node ./bin/torexxx-agent.js new \
  --models-refine "qwen/qwen3-coder:free,mistralai/mistral-small:free" \
  --models-codegen "qwen/qwen3-coder:free,mistralai/mistral-small:free"
```

Переменные окружения:
- `OPENROUTER_API_KEY` — ключ OpenRouter
- `OPENROUTER_EMBEDDED_KEY` — встроенный ключ для закрытой сборки (альтернатива переменной `OPENROUTER_API_KEY`)
- `OPENROUTER_BASE_URL` — базовый URL для OpenRouter API (по умолчанию `https://openrouter.ai/api/v1`)
- `OPENROUTER_REFERER` — HTTP Referer (рекомендовано)
- `OPENROUTER_TITLE` — заголовок приложения (рекомендовано)
- `OR_MODEL_REFINE` / `OR_MODEL_CODEGEN` — переопределить модели для OpenRouter
- `OR_MODEL_REFINE_FALLBACK` — запасная модель для нормализации промта (используется при 429/403)
- `OR_MODEL_CODEGEN_FALLBACK` — запасная модель для кодогенерации (OpenRouter)
- `OR_MODELS_REFINE` — пул моделей для нормализации (через запятую; первая — основная)
- `OR_MODELS_CODEGEN` — пул моделей для генерации кода (через запятую; первая — основная)
- `OPENROUTER_RETRY_MS` — задержка перед повтором при 429 (мс, по умолчанию 2000)

## Лимиты и фолбэк моделей
- Агент поддерживает пользовательский пул моделей. Если основная модель падает по любой причине (429, 403, несовместимость формата и т.п.), запускается следующая модель из списка.
- При `429` от OpenRouter ("rate-limited upstream") агент может сделать повтор через `OPENROUTER_RETRY_MS`, а затем переключиться на следующую модель из пула (или `OR_MODEL_CODEGEN_FALLBACK`).
- При `403` ("Access Forbidden" / "not available in your region") агент автоматически пробует безопасную альтернативу из пула, например `qwen/qwen3-coder:free`.
- Некоторые модели не принимают `response_format`. Агент автоматически повторяет запрос без этого поля, чтобы сохранить совместимость.
- Для повышения лимитов рекомендуется указать собственный `OPENROUTER_API_KEY`.
- Для строгого JSON лучше использовать модели вроде `qwen/qwen3-coder:free`/совместимые.

## Установка как полноценного CLI (macOS/Windows)
- Глобальная установка локально (dev):
  - Выполните `npm run link` в корне проекта.
  - Запускайте команду `torexxx-agent new` из любой директории.
- Глобальная установка из пакета (после публикации):
  - `npm i -g torexxx-agent`
  - или одноразово: `npx torexxx-agent new`
- Сборка самодостаточных бинарников:
  - macOS: `npm run build:mac` → файлы в `dist/` (`torexxx-agent-x64`, `torexxx-agent-arm64`)
  - Windows: `npm run build:win` → `dist/torexxx-agent.exe`
  - Все сразу: `npm run build:all`

## Что сохраняется
- `prompt.original.txt` — исходная формулировка задачи
- `prompt.refined.json` — очищенный ТЗ (бриф)
- `generation.raw.md` — полный потоковый ответ модели
- Сгенерированные файлы проекта по блокам `<<<FILE: ...>>>`
- `meta.json` — метаданные о генерации

## Формат ответа модели
Агент ожидает строгий формат для каждого файла:

```
<<<FILE: relative/path>>>
```<lang or text>
...content...
```
<<<END FILE>>>
```

## Примечания
- Для OpenRouter требуется валидный ключ: установите `OPENROUTER_API_KEY` или используйте `OPENROUTER_EMBEDDED_KEY`.
- Модели задавайте флагами `--model-refine` и `--model-codegen`, либо пулом `--models-refine` / `--models-codegen` (или через переменные окружения).
- Весь UX выполнен в терминальном стиле с анимациями (спиннеры, градиенты, стриминг токенов).
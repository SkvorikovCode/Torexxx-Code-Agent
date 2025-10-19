# Torexxx Agent (CLI)

Красивый CLI агент в стиле "Claude Code", который:
- принимает задачу на написание кода;
- нормализует промт через `llama3.1:latest` (Ollama) или OpenRouter;
- генерирует код через локальные модели Ollama (по умолчанию) или модели OpenRouter;
- сохраняет артефакты и файлы в `Torexxx-Agent/projects/*`.

## Требования
- Node.js >= 18
- Установленный и запущенный Ollama (`ollama serve`) — для провайдера `ollama`
- Аккаунт OpenRouter и ключ API `OPENROUTER_API_KEY` — для провайдера `openrouter`
- Модели (для Ollama):
  - `ollama pull llama3.1`
  - `ollama pull qwen2.5-coder`

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

Самый простой запуск — без флагов: агент сам определит провайдера (если Ollama доступен — выберет его; если найден `OPENROUTER_API_KEY` или Ollama недоступен — переключится на OpenRouter).

Или сразу передать задачу без интерактива:

```bash
node ./bin/torexxx-agent.js new --prompt "Сделай веб-сервер на Node.js с кнопкой и счётом кликов"
```

При необходимости задайте адрес Ollama:

```bash
node ./bin/torexxx-agent.js new --host http://localhost:11434
```

Приоритет источников настроек: флаги CLI > переменные окружения.

### Использование .env
CLI автоматически загружает переменные из файлов `.env` и `.env.local` в корне проекта (значения из `.env.local` перекрывают `.env`). Пример: скопируйте `.env.example` в `.env` и заполните значения.

Использование с OpenRouter (явно):

```bash
# Вариант 1: через .env
# OPENROUTER_API_KEY=...  # или OPENROUTER_EMBEDDED_KEY=...
node ./bin/torexxx-agent.js new --provider openrouter

# Вариант 2: экспорт в shell
export OPENROUTER_API_KEY=your_api_key_here
node ./bin/torexxx-agent.js new --provider openrouter \
  --model-refine openai/gpt-4o-mini \
  --model-codegen openai/gpt-4o-mini
```

Переменные окружения:
- `OLLAMA_HOST` — адрес Ollama (по умолчанию `http://localhost:11434`)
- `OPENROUTER_API_KEY` — ключ OpenRouter
- `OPENROUTER_EMBEDDED_KEY` — встроенный ключ для закрытой сборки (альтернатива переменной `OPENROUTER_API_KEY`)
- `OPENROUTER_BASE_URL` — базовый URL для OpenRouter API (по умолчанию `https://openrouter.ai/api/v1`)
- `LLM_PROVIDER` — провайдер по умолчанию (`ollama` или `openrouter`)
- `OR_MODEL_REFINE` / `OR_MODEL_CODEGEN` — переопределить модели для OpenRouter
- `OR_MODEL_CODEGEN_FALLBACK` — запасная модель для кодогенерации (OpenRouter)
- `OPENROUTER_RETRY_MS` — задержка перед повтором при 429 (мс, по умолчанию 2000)

## Лимиты и фолбэк моделей
- При `429` от OpenRouter ("rate-limited upstream") агент сначала делает повтор через `OPENROUTER_RETRY_MS`, затем переключается на `OR_MODEL_CODEGEN_FALLBACK` (если задано) или на `meta-llama/llama-3.1-8b-instruct:free` по умолчанию.
- Некоторые модели не принимают `response_format`. Агент автоматически повторяет запрос без этого поля, чтобы сохранить совместимость.
- Для повышения лимитов рекомендуется указать собственный `OPENROUTER_API_KEY`.
- Для строгого JSON лучше использовать модели вроде `qwen/qwen3-coder:free`/совместимые.

## Что сохраняется
- `prompt.original.txt` — исходная формулировка задачи
- `prompt.refined.json` — очищенный ТЗ (бримф)
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
- Если Ollama не запущен или модели не скачаны, агент сообщит об ошибке подключения.
- Для OpenRouter требуется валидный ключ: установите `OPENROUTER_API_KEY` или используйте `OPENROUTER_EMBEDDED_KEY`.
- Модели задавайте флагами `--model-refine` и `--model-codegen` (или оставьте дефолтные; агент всё сделает сам).
- Весь UX выполнен в терминальном стиле с анимациями (спиннеры, градиенты, стриминг токенов).
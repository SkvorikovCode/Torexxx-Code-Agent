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

Самый простой запуск — без флагов: агент сам определит провайдера (если Ollama доступен — выберет его; если найден `OPENROUTER_API_KEY` или Ollama недоступен — предложит OpenRouter) и, при необходимости, спросит ключ и сохранит его в конфиге `~/.torexxx-agent/config.json`.

Или сразу передать задачу без интерактива:

```bash
node ./bin/torexxx-agent.js new --prompt "Сделай веб-сервер на Node.js с кнопкой и счётом кликов"
```

При необходимости задайте адрес Ollama:

```bash
node ./bin/torexxx-agent.js new --host http://localhost:11434
```
Агент предложит сохранить указанный `--host` в конфиге `~/.torexxx-agent/config.json` (поле `ollamaHost`), чтобы использовать его по умолчанию в следующих запусках.
Приоритет источников настроек: флаги CLI > конфиг > переменные окружения.

Использование с OpenRouter (явно):

```bash
export OPENROUTER_API_KEY=your_api_key_here
node ./bin/torexxx-agent.js new --provider openrouter \
  --model-refine openai/gpt-4o-mini \
  --model-codegen openai/gpt-4o-mini
```

Переменные окружения:
- `OLLAMA_HOST` — адрес Ollama (по умолчанию `http://localhost:11434`)
- `OPENROUTER_API_KEY` — ключ OpenRouter
- `OPENROUTER_BASE_URL` — базовый URL для OpenRouter API (по умолчанию `https://openrouter.ai/api/v1`)
- `LLM_PROVIDER` — провайдер по умолчанию (`ollama` или `openrouter`)

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
- Для OpenRouter требуется валидный `OPENROUTER_API_KEY`. Модели задавайте флагами `--model-refine` и `--model-codegen` (или оставьте дефолтные; агент всё сделает сам).
- Весь UX выполнен в терминальном стиле с анимациями (спиннеры, градиенты, стриминг токенов).
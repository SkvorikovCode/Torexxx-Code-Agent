# Torexxx Agent (CLI)

Красивый CLI агент в стиле "Claude Code", который:
- принимает задачу на написание кода;
- нормализует промт через `llama3.1:latest` (Ollama);
- генерирует код через `qwen2.5-coder:latest` (Ollama);
- сохраняет артефакты и файлы в `Torexxx-Agent/projects/*`.

## Требования
- Node.js >= 18
- Установленный и запущенный Ollama (`ollama serve`)
- Модели:
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

Или сразу передать задачу без интерактива:

```bash
node ./bin/torexxx-agent.js new --prompt "Сделай веб-сервер на Node.js с кнопкой и счётом кликов"
```

При необходимости задайте адрес Ollama:

```bash
node ./bin/torexxx-agent.js new --host http://localhost:11434
```

## Что сохраняется
- `prompt.original.txt` — исходная формулировка задачи
- `prompt.refined.json` — очищенный ТЗ (бримф) от `llama3.1`
- `generation.raw.md` — полный потоковый ответ `qwen2.5-coder`
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
- Весь UX выполнен в терминальном стиле с анимациями (спиннеры, градиенты, стриминг токенов).
# Тесты и релизы

## Локальные проверки

`AGENTS.md`, `skills/morfira-sdd/SKILL.md` и `specs/` определяют разработку по спецификациям. `pnpm run check:project` проверяет стиль исходников, лицензии и runtime-границы.

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit
pnpm run check
pnpm run docs:build
```

`check` проверяет TypeScript/Svelte, собирает пакеты, контролирует вес и запускает браузерные тесты. Тесты используют собранные публичные exports, а не алиасы исходников. Для короткого прогона есть `pnpm test --project=chromium`. Браузеры нужны только для разработки.

Проверяются форматирование и undo/redo, очистка HTML при импорте/вставке/экспорте, замена выделения, создание и структура таблиц, объединение/разделение и восстановление документа, режим чтения, уничтожение экземпляра и синхронизация/события/lifecycle трёх адаптеров. React монтируется в StrictMode. Это покрытие поведения, а не заявление о 100% покрытии исходников.

Новые функции должны получать реальные сценарии: вставка между ячейками, сложные rowspan/colspan, IME, большие документы, граничные клавиатурные операции, внешние clipboard-примеры, touch/mobile, доступность и освобождение памяти. В regression fixtures не должно быть клиентских данных.

## Автоматические семантические релизы

Версии шести библиотечных workspace независимы. semantic-release анализирует Conventional Commits только для файлов изменённого пакета; multi-semantic-release согласует версии внутренних зависимостей и повышает версии зависимых пакетов с тем же уровнем изменения. Приложение документации приватное.

- `fix(core): ...`, `perf(core): ...` — patch.
- `feat(plugins): ...` — minor.
- `break(core): ...` — отдельная явная метка major, включая зависимые адаптеры и публичный пакет. Стандартные `feat(core)!: ...` и footer `BREAKING CHANGE: ...` также распознаются.
- Коммиты только с документацией, тестами или chore не выпускают библиотеку.

Scope коммита помогает читать историю; пакет определяется изменёнными файлами. Теги: `@morfira-dev/wysiwyg-core@1.0.0`, `@morfira-dev/wysiwyg@1.0.0` и аналогично для остальных. Пока тегов нет, первый автоматический релиз будет `1.0.0` по правилам semantic-release. После успешного релиза версии и внутренние диапазоны в исходниках синхронизируются с опубликованными пакетами одним служебным коммитом. Это не обещание полного набора возможностей зрелых редакторов.

```sh
pnpm run test:release
pnpm run release:plan
```

План не публикует пакеты, не пушит теги, не создаёт GitHub Release и не требует npm-доступа. В полноценном релизе появляются заметки GitHub Release. `pnpm run release` разрешён только внутри GitHub Actions после проверок. После успешной публикации всех пакетов release job обновляет `pnpm-lock.yaml` через `pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile` и сохраняет манифесты с lockfile одним коммитом `chore(release): sync package versions [skip ci]` от github-actions[bot]. Push выполняется с GITHUB_TOKEN без force. Этот push не запускает новый workflow; тип `chore` также не создаёт релиз при ручном повторном запуске. Dry-run, ошибка публикации или отсутствие новых релизов не создают коммитов. Если main успел измениться, push отклоняется; опубликованные версии при этом не удаляются.

## GitHub Actions и npm OIDC

Workflow `release.yml` запускается для main и вручную. Сначала вызывается полный Check: редактор в Chromium/Firefox/WebKit, типы, сборка, бюджеты, сайт и демки. Затем сохраняется артефакт `release-plan`. Публикация включается только переменной репозитория `NPM_PUBLISH_ENABLED=true`; без неё успешно выполняются проверки и план, а publish пропускается. PR не публикует пакеты. Сайт остаётся локальным.

Для **каждого** из пакетов `@morfira-dev/wysiwyg-core`, `@morfira-dev/wysiwyg-plugins`, `@morfira-dev/wysiwyg-vue`, `@morfira-dev/wysiwyg-react`, `@morfira-dev/wysiwyg-svelte`, `@morfira-dev/wysiwyg` в npm → Settings → Trusted publishing добавьте GitHub Actions:

| Поле | Значение |
| --- | --- |
| Organization/user | `morfira-dev` |
| Repository | `morfira-wysiwyg` |
| Workflow filename | `release.yml` |
| Environment | оставить пустым |
| Allowed action | `npm publish` |

Workflow получает `id-token: write` и `contents: write`; постоянный `NPM_TOKEN` не нужен. Публичные пакеты из публичного репозитория получают provenance. Не задавайте registry-url в setup-node: npm-плагин semantic-release сам управляет аутентификацией. [Официальная инструкция npm](https://docs.npmjs.com/trusted-publishers/).

Если npm ещё не позволяет настроить доверие для нового имени, владелец scope должен один раз опубликовать стартовые пакеты интерактивно с 2FA. После `pnpm run build` и `npm login` выполните в указанном порядке:

```sh
pnpm --filter @morfira-dev/wysiwyg-core publish --access public
pnpm --filter @morfira-dev/wysiwyg-plugins publish --access public
pnpm --filter @morfira-dev/wysiwyg-vue publish --access public
pnpm --filter @morfira-dev/wysiwyg-react publish --access public
pnpm --filter @morfira-dev/wysiwyg-svelte publish --access public
pnpm --filter @morfira-dev/wysiwyg publish --access public
```

Это реальная публикация `0.2.0`, а не проверка: выполнять только при готовности выпустить пакеты. Затем настройте все шесть trusted publishers, включите переменную и запустите Release. Первый автоматический релиз `1.0.0` обновит все внутренние зависимости. Не создавайте фиктивные release-теги до публикации. Новую связь npm нужно подтвердить успешной публикацией в течение 2 дней; если она истекла, создайте заново. Доступ к npm и успешную OIDC-публикацию нельзя подтвердить локальными тестами.

Для OIDC publish job явно устанавливает npm CLI `11.21.2`: npm 10 из Node.js 22 не поддерживает этот способ публикации. Перед созданием тегов скрипт проверяет npm >=11.5.1 и доступность GitHub OIDC. pnpm остаётся менеджером workspace. При сбое после создания тега версия могла не попасть в npm: проверяйте реестр, не считайте тег доказательством публикации и не удаляйте опубликованные версии.

`pnpm run check` также запускает `check:tree-shaking`: реальные публичные импорты потребителя не должны сохранять посторонние плагины, фреймворки или обязательный CSS. Проверки исходников закрепляют владение именованными типами и направление зависимостей ядра.

Отдельная интеграционная проверка после сборки: `pnpm run consumers:check`. Наблюдательные [бенчмарки производительности/истории](/performance): `pnpm run benchmark`; они не входят в обычный gate корректности без timing-порогов.

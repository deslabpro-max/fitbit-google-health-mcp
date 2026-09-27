# Fitbit / Google Health → Claude, ChatGPT, Gemini

*English: personal MCP connector exposing your Google Health (Fitbit) data to AI assistants, self-hosted on Cloudflare Workers free tier. Setup guide is currently in Russian.*

**Личный MCP-коннектор**: спрашивайте свой ИИ-ассистент о шагах, сне, пульсе,
SpO2 и тренировках с браслета Fitbit (или Pixel Watch) — и записывайте вес,
еду, воду и тренировки голосом прямо из чата.

> «Как я спал на этой неделе?» · «Сколько шагов сегодня?» · «Запиши обед
> 650 ккал» · «Какой у меня пульс покоя за месяц, есть ли тренд?»

Данные берутся из **Google Health API v4** — облака, куда устройства Fitbit
синхронизируются через приложение Fitbit. Коннектор — это ваш личный сервер
на **бесплатном** тарифе Cloudflare Workers: никаких чужих серверов между
вашим здоровьем и вашим ИИ, ключи и токены только у вас.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/deslabpro-max/fitbit-google-health-mcp)

Работает с: **Claude** (веб, мобильный, десктоп — пользовательские коннекторы),
**ChatGPT** (Developer mode, планы Plus/Pro), **Gemini CLI**, а также любым
MCP-клиентом со Streamable HTTP + OAuth.

🤖 **Хотите, чтобы всё сделал ИИ?** Промт для Claude Code или Codex: [docs/AGENT_PROMPT.md](docs/AGENT_PROMPT.md).

🧭 **Не программист? Не страшно.** Подробная пошаговая инструкция для новичков
(каждый клик, все ошибки и решения): **[docs/SETUP.md](docs/SETUP.md)**.
📄 Красивая PDF-версия для печати и Telegram: [docs/Инструкция-Fitbit-Claude-ChatGPT.pdf](docs/Инструкция-Fitbit-Claude-ChatGPT.pdf).
Версия для вставки в форумный пост (BB-код): [docs/4pda.bbcode.txt](docs/4pda.bbcode.txt).

---

## Что умеет

| Инструмент | Что делает |
|---|---|
| `get_daily_summary` | Сводка за день: активность, сон с фазами, пульс, SpO2, HRV, температура кожи во сне, дыхание, AFib-уведомления, вес |
| `get_activity` | Шаги, дистанция, калории, этажи, зонные минуты по дням за период |
| `get_sleep` | Сессии сна с фазами (глубокий / REM / лёгкий) |
| `get_heart_rate` | Пульс за день: покоя, min/max/avg, почасовая разбивка |
| `get_exercises` | Тренировки за период с метриками |
| `get_metric` | Ещё ~25 типов данных: SpO2, HRV, дыхание во сне, температура, зоны пульса, сидячие периоды, глюкоза, вода, питание, AFib и др. |
| `get_device_status` | Модель устройства, батарея, время последней синхронизации |
| `log_weight` / `log_body_fat` | Записать вес / процент жира |
| `log_water` / `log_food` | Записать воду / еду с калориями и БЖУ |
| `log_exercise` | Записать тренировку вручную |
| `log_mood` / `log_symptom` | Настроение / симптомы |
| `delete_log` | Удалить записи, созданные коннектором |

Данные браслета коннектор изменить **не может** — Google Health позволяет
приложению править и удалять только записи, которые оно само создало.

## Как это устроено

```
Браслет Fitbit ──BT──► приложение Fitbit ──► Google Health API (облако Google)
                                                   ▲
                                     OAuth 2.0, readonly + свои логи
                                                   │
Claude / ChatGPT / Gemini ──MCP──► ваш Worker на Cloudflare (этот репозиторий)
```

- Воркер — одновременно MCP-сервер (Streamable HTTP) и OAuth-сервер для
  ИИ-клиента ([`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider), с Google как upstream-провайдером).
- Токены Google хранятся в зашифрованном виде в вашем Cloudflare KV.
- Времена и даты — «гражданские» (civil time): часовой пояс пользователя
  учитывается самим Google Health, серверу его знать не нужно.

## Установка (кратко)

Полная пошаговая инструкция — [docs/SETUP.md](docs/SETUP.md).

1. **Cloudflare** — нажмите кнопку «Deploy to Cloudflare» выше. Cloudflare
   склонирует репозиторий в ваш GitHub, сам создаст KV-хранилище и настроит
   автодеплой. Запишите адрес воркера: `https://<имя>.<поддомен>.workers.dev`.
2. **Google Cloud** ([console.cloud.google.com](https://console.cloud.google.com)) —
   создайте проект, включите **Google Health API**, в OAuth-настройках добавьте
   себя в Test users и создайте клиент типа **Web application** с redirect URI
   `https://<адрес-воркера>/callback`. Скопируйте Client ID и Client secret.
3. **Секреты** — в воркере: Settings → Variables and Secrets → добавьте
   `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET` (тип Secret).
4. **Подключение**:
   - **Claude**: Settings → Connectors → Add custom connector →
     `https://<адрес-воркера>/mcp` → Connect → окно Google.
   - **ChatGPT**: Settings → включить Developer mode → добавить MCP-коннектор
     с тем же URL (OAuth).
   - **Gemini CLI**: блок `mcpServers` в `~/.gemini/settings.json` с
     `httpUrl` и `"oauth": {"enabled": true}`.

## Установка с помощью ИИ-агента (Claude Code / Codex)

Не хотите делать шаги руками? Откройте Claude Code или OpenAI Codex и
вставьте промт из **[docs/AGENT_PROMPT.md](docs/AGENT_PROMPT.md)**. Агент сам
выполнит терминальную часть (клонирование, `npm install`, `wrangler login`,
KV, деплой, секреты), а браузерные шаги — Google Cloud Console и окна
согласия — проведёт с вами по одному клику. Секреты вы вводите сами в
терминал, в чат они не попадают.

## Ручная установка (без кнопки)

```bash
git clone https://github.com/deslabpro-max/fitbit-google-health-mcp.git
cd fitbit-google-health-mcp
npm install
npx wrangler login
npx wrangler kv namespace create OAUTH_KV   # id → в wrangler.jsonc
npx wrangler deploy
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

## Обновление

Установка через кнопку — это ваша собственная копия репозитория с настроенным
автодеплоем: пуш в ветку `main` вашей копии пересобирает воркер. Чтобы забрать
новые версии отсюда, добавьте этот репозиторий как remote и смержите изменения.

## Безопасность и приватность

- Запрашиваются только readonly-скоупы Google Health + скоупы записи ручных
  логов; полный список — в [`src/google-auth.ts`](src/google-auth.ts).
- `/mcp` защищён OAuth: посторонний, узнав адрес, данные не получит.
- Секреты живут в Cloudflare Secrets, в git не попадают.
- Приложение в Google Cloud — ваше личное, в режиме «Тестирование»: кроме
  добавленных вами Test users им никто не воспользуется.

## Ограничения

- Fitbit-аккаунт должен быть привязан к Google (для новых устройств это так).
- Данные сенсоров (шаги, пульс, фазы сна) записать через API нельзя — только
  читать; это ограничение Google Health, а не коннектора.
- У свежесозданного приложения в режиме «Тестирование» Google может
  ограничивать срок жизни refresh-токена (~7 дней) — тогда раз в неделю нужен
  повторный Connect, либо переведите приложение в статус «In production».

## Лицензия

[MIT](LICENSE). Проект не аффилирован с Google и Fitbit. Используете на свой
страх и риск; это не медицинское устройство и не медицинский совет.

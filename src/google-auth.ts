/**
 * OAuth-мост между claude.ai и Google.
 *
 * /authorize — claude.ai приводит сюда пользователя; разбираем OAuth-запрос
 *   и перенаправляем в Google за согласием (scopes Google Health, readonly).
 * /callback — Google возвращает code; меняем его на токены, достаём e-mail
 *   из id_token и завершаем авторизацию: OAuthProvider выдаёт claude.ai свой
 *   код, а токены Google уезжают в props гранта (доступны MCP-обработчику).
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const HEALTH_SCOPES = [
  "openid",
  "email",
  // чтение
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.irn.readonly", // уведомления об аритмии (AFib)
  "https://www.googleapis.com/auth/googlehealth.settings.readonly", // статус устройств (батарея, синхронизация)
  "https://www.googleapis.com/auth/googlehealth.nutrition.readonly", // чтение своих логов воды и еды
  // запись ручных логов (коннектор может править/удалять только свои записи)
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.writeonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.writeonly",
  "https://www.googleapis.com/auth/googlehealth.nutrition.writeonly",
  "https://www.googleapis.com/auth/googlehealth.mindfulness.writeonly",
  "https://www.googleapis.com/auth/googlehealth.logged_symptoms.writeonly",
];

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

/** Достаёт payload из JWT без проверки подписи — токен получен напрямую
 *  от token-эндпоинта Google по TLS, подпись проверять не обязательно. */
function decodeJwtPayload(jwt: string): any {
  try {
    const part = jwt.split(".")[1];
    return JSON.parse(new TextDecoder().decode(
      Uint8Array.from(b64urlDecode(part), (c) => c.charCodeAt(0)),
    ));
  } catch {
    return {};
  }
}

async function authorize(request: Request, env: any): Promise<Response> {
  let oauthReqInfo: any;
  try {
    oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (e: any) {
    return new Response("Некорректный запрос авторизации: " + (e?.message || e), { status: 400 });
  }
  if (!oauthReqInfo.clientId) {
    return new Response("Отсутствует client_id", { status: 400 });
  }

  const url = new URL(request.url);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/callback`,
    response_type: "code",
    scope: HEALTH_SCOPES.join(" "),
    access_type: "offline", // нужен refresh_token
    prompt: "consent", // иначе Google выдаёт refresh_token только в первый раз
    state: b64urlEncode(JSON.stringify(oauthReqInfo)),
  });
  return Response.redirect(`${GOOGLE_AUTH_URL}?${params}`, 302);
}

async function callback(request: Request, env: any): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    const hint = error === "access_denied"
      ? " Если приложение в Google Cloud в режиме «Тестирование», добавь свой аккаунт в Test users (раздел Audience)."
      : "";
    return new Response(`Google вернул ошибку: ${error}.${hint}`, { status: 400 });
  }

  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  if (!code || !stateRaw) return new Response("Нет code/state в ответе Google", { status: 400 });

  let oauthReqInfo: any;
  try {
    oauthReqInfo = JSON.parse(b64urlDecode(stateRaw));
  } catch {
    return new Response("Повреждён параметр state", { status: 400 });
  }

  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });
  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    return new Response(`Не удалось обменять код на токены Google (${tokenResp.status}): ${text}`, { status: 502 });
  }
  const tokens: any = await tokenResp.json();
  const idInfo = decodeJwtPayload(tokens.id_token || "");
  const email = idInfo.email || "unknown";

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: idInfo.sub || email,
    metadata: { label: email },
    scope: oauthReqInfo.scope,
    props: {
      email,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      refreshToken: tokens.refresh_token || "",
    },
  });
  return Response.redirect(redirectTo, 302);
}

const HOME_PAGE = `<!doctype html><meta charset="utf-8">
<title>Fitbit Air → Claude</title>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;line-height:1.6">
<h1>🩺 Коннектор Fitbit Air → Claude</h1>
<p>Это удалённый MCP-сервер, отдающий данные браслета из Google Health API.</p>
<p>Чтобы подключить: в claude.ai открой <b>Настройки → Коннекторы → Добавить
пользовательский коннектор</b> и укажи URL:</p>
<p><code id="u"></code></p>
<script>document.getElementById("u").textContent = location.origin + "/mcp";</script>
</body>`;

export const GoogleAuthHandler = {
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/authorize") return authorize(request, env);
    if (pathname === "/callback") return callback(request, env);
    if (pathname === "/" || pathname === "") {
      return new Response(HOME_PAGE, { headers: { "content-type": "text/html;charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },
};

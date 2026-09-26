/**
 * Клиент Google Health API v4 (https://health.googleapis.com/v4).
 *
 * Работает от имени пользователя: refresh_token лежит в props OAuth-гранта,
 * короткоживущий access_token кешируется в KV (ключ — хеш refresh_token),
 * чтобы не дёргать обмен на каждый вызов инструмента.
 *
 * Времена: везде, где возможно, используются «гражданские» (civil) фильтры —
 * это локальное время пользователя, часовой пояс знать не нужно.
 */
import { GOOGLE_TOKEN_URL } from "./google-auth";

const BASE_URL = "https://health.googleapis.com/v4";

export class HealthApiError extends Error {}

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getAccessToken(env: any, props: any): Promise<string> {
  if (!props?.refreshToken) {
    // Google не выдал refresh_token — работаем на access_token, пока жив.
    if (props?.accessToken && props.accessTokenExpiresAt > Date.now() + 30_000) {
      return props.accessToken;
    }
    throw new HealthApiError(
      "Токен Google истёк, а refresh_token отсутствует. Переподключи коннектор в настройках Claude.",
    );
  }

  const cacheKey = "gat:" + (await sha256hex(props.refreshToken));
  const cached: any = await env.OAUTH_KV.get(cacheKey, "json");
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: props.refreshToken,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new HealthApiError(
      `Не удалось обновить токен Google (${resp.status}). ` +
        `Переподключи коннектор в настройках Claude. Ответ: ${text.slice(0, 300)}`,
    );
  }
  const tok: any = await resp.json();
  const ttl = Math.max(60, (tok.expires_in || 3600) - 60);
  await env.OAUTH_KV.put(
    cacheKey,
    JSON.stringify({ token: tok.access_token, exp: Date.now() + ttl * 1000 }),
    { expirationTtl: ttl + 60 },
  );
  return tok.access_token;
}

export async function apiCall(
  env: any,
  props: any,
  path: string,
  opts: { method?: string; query?: Record<string, string>; body?: any } = {},
): Promise<any> {
  const token = await getAccessToken(env, props);
  let url = BASE_URL + path;
  if (opts.query) url += "?" + new URLSearchParams(opts.query);
  const resp = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    // 1500 символов, чтобы в ошибку попадали fieldViolations из google.rpc.BadRequest.
    throw new HealthApiError(`Google Health API ${resp.status} (${path}): ${text.slice(0, 1500)}`);
  }
  return resp.json();
}

/** list с пагинацией. Для sleep/exercise API ограничивает страницу 25 записями. */
export async function listDataPoints(
  env: any,
  props: any,
  dataType: string,
  filter: string,
  { pageSize = 1000, maxPages = 5 }: { pageSize?: number; maxPages?: number } = {},
): Promise<any[]> {
  const points: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const query: Record<string, string> = { filter, pageSize: String(pageSize) };
    if (pageToken) query.pageToken = pageToken;
    const resp = await apiCall(env, props, `/users/me/dataTypes/${dataType}/dataPoints`, { query });
    points.push(...(resp.dataPoints || []));
    pageToken = resp.nextPageToken;
    if (!pageToken) break;
  }
  return points;
}

/** Создание точки данных (ручной лог). Запись асинхронная: API возвращает
 *  Operation, данные появляются в выдаче через несколько секунд. */
export async function createDataPoint(env: any, props: any, dataType: string, dataPoint: any): Promise<any> {
  return apiCall(env, props, `/users/me/dataTypes/${dataType}/dataPoints`, {
    method: "POST",
    body: { dataSource: { recordingMethod: "MANUAL" }, ...dataPoint },
  });
}

/** Удаление точек по их resource name (только созданных этим приложением). */
export async function batchDeleteDataPoints(env: any, props: any, dataType: string, names: string[]): Promise<any> {
  return apiCall(env, props, `/users/me/dataTypes/${dataType}/dataPoints:batchDelete`, {
    method: "POST",
    body: { names },
  });
}

/** ISO-8601 с таймзоной ("2026-08-06T09:30:00+03:00") →
 *  {physicalTime (UTC), utcOffset ("10800s")} для ObservationSampleTime. */
export function toSampleTime(input?: string): { physicalTime: string; utcOffset: string } {
  const s = input || new Date().toISOString();
  const m = String(s).match(/(?:([+-])(\d{2}):?(\d{2})|Z)\s*$/);
  let offsetSec = 0;
  if (m && m[1]) offsetSec = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    throw new HealthApiError(
      `Некорректная дата-время: "${s}". Ожидается ISO 8601 с часовым поясом, например 2026-08-06T09:30:00+03:00`,
    );
  }
  return { physicalTime: d.toISOString().replace(/\.\d{3}Z$/, "Z"), utcOffset: `${offsetSec}s` };
}

/** То же для SessionTimeInterval. API требует start строго меньше end,
 *  поэтому «моментальные» логи (вода, еда) получают интервал в 1 минуту. */
export function toSessionInterval(startInput?: string, endInput?: string) {
  const start = toSampleTime(startInput);
  const end = toSampleTime(endInput || startInput);
  let endTime = end.physicalTime;
  if (Date.parse(endTime) <= Date.parse(start.physicalTime)) {
    endTime = new Date(Date.parse(start.physicalTime) + 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");
  }
  return {
    startTime: start.physicalTime,
    startUtcOffset: start.utcOffset,
    endTime,
    endUtcOffset: end.utcOffset,
  };
}

/** Типы, у которых API ограничивает диапазон роллапа 14 днями
 *  (у остальных — 90). */
const SHORT_ROLLUP_RANGE = new Set([
  "heart-rate", "total-calories", "active-minutes", "calories-in-heart-rate-zone",
]);

export function rollupRangeCapDays(dataType: string): number {
  return SHORT_ROLLUP_RANGE.has(dataType) ? 14 : 90;
}

/** Режет [start, endExclusive) на подряд идущие куски не длиннее capDays. */
export function chunkCivilRange(
  start: string,
  endExclusive: string,
  capDays: number,
): Array<{ start: string; endExclusive: string }> {
  const chunks: Array<{ start: string; endExclusive: string }> = [];
  for (let s = start; s < endExclusive; ) {
    const e = addDays(s, capDays);
    const chunkEnd = e < endExclusive ? e : endExclusive;
    chunks.push({ start: s, endExclusive: chunkEnd });
    s = chunkEnd;
  }
  return chunks;
}

/** Тело dailyRollUp-запроса. pageSize НЕ передаём: живой API умножает его на
 *  windowSizeDays, принимает произведение за запрошенную длительность и отдаёт
 *  INVALID_ROLLUP_QUERY_DURATION на любой диапазон. windowSizeDays, наоборот,
 *  обязателен: без него живой API отвечает 400, хотя в документации поле
 *  необязательное. */
export function dailyRollUpBody(startDate: string, endExclusiveDate: string, dataSourceFamily?: string) {
  return {
    range: { start: { date: toApiDate(startDate) }, end: { date: toApiDate(endExclusiveDate) } },
    windowSizeDays: 1,
    ...(dataSourceFamily
      ? { dataSourceFamily: `users/me/dataSourceFamilies/${dataSourceFamily}` }
      : {}),
  };
}

/** Суточная агрегация по локальным (civil) суткам пользователя.
 *  startDate/endDate — включительно, формат YYYY-MM-DD. Диапазоны длиннее
 *  лимита API запрашиваются кусками и склеиваются.
 *  dataSourceFamily: "all-sources" (по умолчанию) | "google-wearables" | "google-sources". */
export async function dailyRollUp(
  env: any,
  props: any,
  dataType: string,
  startDate: string,
  endDate: string,
  dataSourceFamily?: string,
): Promise<any[]> {
  const points: any[] = [];
  for (const chunk of chunkCivilRange(startDate, addDays(endDate, 1), rollupRangeCapDays(dataType))) {
    const resp = await apiCall(env, props, `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
      method: "POST",
      body: dailyRollUpBody(chunk.start, chunk.endExclusive, dataSourceFamily),
    });
    points.push(...(resp.rollupDataPoints || []));
  }
  return points;
}

// ---------- Работа с датами ----------

export function assertDate(s: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) {
    throw new HealthApiError(`Параметр "${field}" должен быть датой в формате YYYY-MM-DD, получено: ${s}`);
  }
  return s;
}

export function toApiDate(s: string): { year: number; month: number; day: number } {
  const [year, month, day] = s.split("-").map(Number);
  return { year, month, day };
}

export function addDays(s: string, days: number): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** {date:{year,month,day}, time:{hours,minutes}} → "YYYY-MM-DD HH:MM" */
export function fmtCivil(ct: any): string | undefined {
  const d = ct?.date;
  if (!d?.year) return undefined;
  const pad = (n: number) => String(n || 0).padStart(2, "0");
  let out = `${d.year}-${pad(d.month)}-${pad(d.day)}`;
  if (ct.time && (ct.time.hours !== undefined || ct.time.minutes !== undefined)) {
    out += ` ${pad(ct.time.hours)}:${pad(ct.time.minutes)}`;
  }
  return out;
}

/** Дата civil-интервала суточного роллапа → "YYYY-MM-DD" */
export function rollupDate(point: any): string | undefined {
  return fmtCivil(point?.civilStartTime)?.slice(0, 10);
}

export const num = (v: any): number | undefined =>
  v === undefined || v === null ? undefined : Number(v);

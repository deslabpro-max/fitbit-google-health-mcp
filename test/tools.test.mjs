// Интеграционные тесты инструментов: callTool с подменённым fetch.
// Проверяем, какие запросы реально уходят в Google Health API.
import test from "node:test";
import assert from "node:assert/strict";
import { callTool } from "../dist-test/tools.mjs";

const ENV = {
  OAUTH_KV: {
    get: async () => ({ token: "test-token", exp: Date.now() + 3_600_000 }),
    put: async () => {},
  },
};
const PROPS = { refreshToken: "rt" };

/** Подменяет fetch; route(url, body) возвращает payload ответа. */
function stubFetch(route) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), body });
    const payload = route(String(url), body) ?? {};
    return { ok: true, status: 200, json: async () => payload, text: async () => "" };
  };
  return calls;
}

const day = (y, m, d) => ({ civilStartTime: { date: { year: y, month: m, day: d } } });

test("get_activity: тела dailyRollUp без pageSize и с windowSizeDays=1", async () => {
  const calls = stubFetch((url) =>
    url.includes(":dailyRollUp")
      ? { rollupDataPoints: [{ ...day(2026, 8, 5), steps: { countSum: "5230" } }] }
      : { dataPoints: [] },
  );
  await callTool("get_activity", { start_date: "2026-08-05", end_date: "2026-08-06" }, ENV, PROPS);

  const rollups = calls.filter((c) => c.url.includes(":dailyRollUp"));
  assert.equal(rollups.length, 6, "по одному роллапу на каждый из 6 типов активности");
  for (const c of rollups) {
    assert.ok(!("pageSize" in c.body), `pageSize не должен уходить в API (${c.url})`);
    assert.equal(c.body.windowSizeDays, 1, c.url);
    assert.deepEqual(c.body.range.start.date, { year: 2026, month: 8, day: 5 });
    assert.deepEqual(c.body.range.end.date, { year: 2026, month: 8, day: 7 });
  }
});

test("get_activity: total-calories длиннее 14 дней запрашивается кусками и склеивается", async () => {
  const calls = stubFetch((url, body) => {
    if (!url.includes(":dailyRollUp")) return { dataPoints: [] };
    if (url.includes("/total-calories/")) {
      // Разные дни в разных кусках — проверяем склейку.
      return body.range.start.date.day === 18
        ? { rollupDataPoints: [{ ...day(2026, 7, 20), totalCalories: { kcalSum: 2000 } }] }
        : { rollupDataPoints: [{ ...day(2026, 8, 2), totalCalories: { kcalSum: 2200 } }] };
    }
    if (url.includes("/steps/")) {
      return { rollupDataPoints: [{ ...day(2026, 7, 20), steps: { countSum: "8000" } }] };
    }
    return { rollupDataPoints: [] };
  });
  // 20 дней: total-calories (лимит 14) должен уйти двумя кусками, steps (90) — одним.
  const res = await callTool(
    "get_activity", { start_date: "2026-07-18", end_date: "2026-08-06" }, ENV, PROPS,
  );

  const tc = calls.filter((c) => c.url.includes("/total-calories/"));
  assert.equal(tc.length, 2, "два куска по лимиту 14 дней");
  assert.deepEqual(tc[0].body.range.end.date, tc[1].body.range.start.date, "куски смежные");
  assert.equal(calls.filter((c) => c.url.includes("/steps/")).length, 1);

  assert.equal(res.sourceFamily, "all-sources");
  const byDate = Object.fromEntries(res.days.map((d) => [d.date, d]));
  assert.equal(byDate["2026-07-20"].steps, 8000);
  assert.equal(byDate["2026-07-20"].totalCaloriesKcal, 2000);
  assert.equal(byDate["2026-08-02"].totalCaloriesKcal, 2200);
});

test("get_activity: период длиннее 90 дней отклоняется без запросов к API", async () => {
  const calls = stubFetch(() => ({}));
  await assert.rejects(
    () => callTool("get_activity", { start_date: "2026-01-01", end_date: "2026-06-30" }, ENV, PROPS),
    /90 дней/,
  );
  assert.equal(calls.length, 0);
});

test("get_activity: при пустом all-sources пробует google-wearables", async () => {
  const calls = stubFetch((url, body) => {
    if (!url.includes(":dailyRollUp")) return { dataPoints: [] };
    if (body.dataSourceFamily === "users/me/dataSourceFamilies/google-wearables" && url.includes("/steps/")) {
      return { rollupDataPoints: [{ ...day(2026, 8, 5), steps: { countSum: "4100" } }] };
    }
    return { rollupDataPoints: [] };
  });
  const res = await callTool(
    "get_activity", { start_date: "2026-08-05", end_date: "2026-08-05" }, ENV, PROPS,
  );
  assert.equal(res.sourceFamily, "google-wearables");
  assert.equal(res.days[0].steps, 4100);
});

test("get_activity: пусто в обоих семействах — диагностика по сырым точкам шагов", async () => {
  const calls = stubFetch((url) =>
    url.includes(":dailyRollUp") ? { rollupDataPoints: [] } : { dataPoints: [] },
  );
  const res = await callTool(
    "get_activity", { start_date: "2026-08-05", end_date: "2026-08-05" }, ENV, PROPS,
  );
  assert.equal(res.days.length, 0);
  assert.match(res.diagnostics, /не синхронизированы/);
  const raw = calls.find((c) => c.url.includes("/steps/dataPoints?"));
  assert.ok(raw, "должен быть list-запрос сырых точек шагов");
  assert.match(decodeURIComponent(raw.url), /steps\.interval\.civil_start_time/);
});

test("get_metric activity-level: интервальный фильтр, а не суточный", async () => {
  // nextPageToken в ответе — проверяем, что за вторую страницу не ходим (maxPages=1).
  const calls = stubFetch(() => ({ dataPoints: [], nextPageToken: "t" }));
  await callTool(
    "get_metric",
    { data_type: "activity-level", start_date: "2026-08-05", end_date: "2026-08-06" },
    ENV, PROPS,
  );
  const url = decodeURIComponent(calls[0].url).replace(/\+/g, " ");
  assert.match(url, /activity_level\.interval\.civil_start_time >= "2026-08-05"/);
  assert.match(url, /activity_level\.interval\.civil_start_time < "2026-08-07"/);
  assert.ok(!url.includes("activity_level.date"), "суточный фильтр .date для activity-level невалиден");
  assert.match(url, /pageSize=200/, "поминутный activity-level должен запрашиваться маленькой страницей");
  assert.equal(calls.length, 1, "maxPages=1 — без пагинации");
});

test("get_metric: write-only типы (moods) больше не предлагаются — понятная ошибка", async () => {
  const calls = stubFetch(() => ({ dataPoints: [] }));
  await assert.rejects(
    () => callTool("get_metric", { data_type: "moods", start_date: "2026-08-01", end_date: "2026-08-06" }, ENV, PROPS),
    /Неизвестный data_type/,
  );
  assert.equal(calls.length, 0);
});

test("log_water: моментальный лог уходит с минутным интервалом", async () => {
  const calls = stubFetch(() => ({ done: true }));
  await callTool(
    "log_water", { volume_ml: 250, datetime: "2026-08-06T17:45:00+03:00" }, ENV, PROPS,
  );
  const body = calls[0].body;
  assert.equal(body.hydrationLog.amountConsumed.milliliters, 250);
  assert.equal(body.hydrationLog.interval.startTime, "2026-08-06T14:45:00Z");
  assert.equal(body.hydrationLog.interval.endTime, "2026-08-06T14:46:00Z");
});

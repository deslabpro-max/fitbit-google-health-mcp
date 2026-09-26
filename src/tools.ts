/**
 * MCP-инструменты коннектора: что Claude может спросить у браслета.
 *
 * Все даты — в локальном времени пользователя (civil time), поэтому
 * "2026-08-05" — это календарный день там, где носится браслет.
 */
import {
  HealthApiError,
  addDays,
  apiCall,
  assertDate,
  batchDeleteDataPoints,
  createDataPoint,
  dailyRollUp,
  fmtCivil,
  listDataPoints,
  num,
  rollupDate,
  toSampleTime,
  toSessionInterval,
  todayUtc,
} from "./health-api";

const DATE_PROP = { type: "string", description: "Дата в формате YYYY-MM-DD (локальный день пользователя)" };
const DATETIME_PROP = {
  type: "string",
  description:
    "Дата-время события в ISO 8601 С ЧАСОВЫМ ПОЯСОМ пользователя, например 2026-08-06T09:30:00+03:00. " +
    "Если не указано — текущий момент (UTC). Всегда передавай локальный пояс пользователя, иначе запись попадёт не в те сутки.",
};

const MOOD_VALUES = [
  "AMAZED", "AMUSED", "ANGRY", "ANNOYED", "ANXIOUS", "HAPPY", "CONTENT", "SAD", "WORRIED",
  "FRUSTRATED", "EXCITED", "CALM", "STRESSED", "ASHAMED", "BRAVE", "CONFIDENT", "DISAPPOINTED",
  "DISCOURAGED", "DISGUSTED", "DRAINED", "EMBARRASSED", "GRATEFUL", "GUILTY", "HOPEFUL",
  "HOPELESS", "INDIFFERENT", "IRRITATED", "JEALOUS", "JOYFUL", "LONELY", "OVERWHELMED",
  "PASSIONATE", "PEACEFUL", "PROUD", "RELIEVED", "SATISFIED", "SCARED", "SURPRISED",
  "ENERGIZED", "FATIGUED", "VERY_CALM", "VERY_STRESSED", "NEUTRAL", "AFRAID", "HURTING",
  "BORED", "BITTER", "ENVIOUS", "CONFUSED", "CURIOUS", "AWESTRUCK", "INSPIRED", "LONGING",
  "ACCOMPLISHED", "LOVING", "COMPASSIONATE",
];

const SYMPTOM_VALUES = [
  "CRAMPS", "HEADACHE", "TENDER_BREASTS", "ACNE", "SICK", "BLOATED", "HOT_FLASHES", "PMS",
  "COUGH", "FEVER", "DIFFICULTY_BREATHING", "BACK_PAIN", "SHAKINESS", "HUNGER", "SWEATING",
  "ANXIETY", "THIRST", "FREQUENT_URINATION", "BLURRED_VISION", "OTHER", "SEX_DRIVE_HIGH",
  "SEX_DRIVE_MEDIUM", "SEX_DRIVE_LOW", "HEART_PALPITATIONS", "FAINTING", "CHEST_PAIN",
  "FATIGUE", "CONFUSION", "DIZZINESS",
];

export const TOOLS = [
  {
    name: "get_daily_summary",
    description:
      "Сводка за один день с браслета Fitbit Air: шаги, дистанция, калории, этажи, " +
      "активные зонные минуты, пульс покоя, сон и вес. Начни с этого инструмента, " +
      "если пользователь спрашивает «как я сегодня/вчера».",
    inputSchema: {
      type: "object",
      properties: {
        date: { ...DATE_PROP, description: DATE_PROP.description + ". По умолчанию — сегодня (UTC)" },
      },
    },
  },
  {
    name: "get_activity",
    description:
      "Активность по дням за период: шаги, дистанция (км), активные калории, общие калории, " +
      "этажи и активные зонные минуты (fat burn / cardio / peak). Обе даты включительно. " +
      "Период — не длиннее 90 дней; более долгие интервалы запрашивай частями.",
    inputSchema: {
      type: "object",
      properties: { start_date: DATE_PROP, end_date: DATE_PROP },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_sleep",
    description:
      "Сон за период (сессии, закончившиеся в указанные дни): длительность, время засыпания " +
      "и пробуждения, минуты сна/бодрствования, сводка по фазам (глубокий, REM, лёгкий). " +
      "include_stages=true добавляет посегментную раскладку фаз.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: DATE_PROP,
        end_date: DATE_PROP,
        include_stages: { type: "boolean", description: "Вернуть также посегментные фазы сна (по умолчанию false)" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_heart_rate",
    description:
      "Пульс за один день: пульс покоя, min/max/среднее за день и почасовая разбивка по замерам браслета.",
    inputSchema: {
      type: "object",
      properties: { date: DATE_PROP },
      required: ["date"],
    },
  },
  {
    name: "get_exercises",
    description:
      "Тренировки за период: тип, название, время, длительность, калории, дистанция, средний пульс, зонные минуты.",
    inputSchema: {
      type: "object",
      properties: { start_date: DATE_PROP, end_date: DATE_PROP },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_metric",
    description:
      "Произвольная метрика Google Health за период (сырые точки данных). Основные типы: " +
      "weight (вес), body-fat (% жира), oxygen-saturation / daily-oxygen-saturation (SpO2), " +
      "heart-rate-variability / daily-heart-rate-variability (HRV), daily-respiratory-rate и " +
      "respiratory-rate-sleep-summary (дыхание во сне), daily-sleep-temperature-derivations " +
      "(температура кожи во сне), irregular-rhythm-notification (уведомления о возможной " +
      "фибрилляции предсердий, AFib), daily-heart-rate-zones, sedentary-period, " +
      "activity-level (поминутный — объёмный, для сводок используй get_activity), " +
      "core-body-temperature, blood-glucose, hydration-log (вода), nutrition-log (еда) и др. " +
      "Настроения/симптомы через API не читаются (write-only) — их можно только записывать.",
    inputSchema: {
      type: "object",
      properties: {
        data_type: {
          type: "string",
          // Только типы, у которых API поддерживает list. Write-only типы
          // (moods, symptoms, menstrual-period, ovulation-test) и rollup-only
          // (active-minutes, time-in-heart-rate-zone) в list отвечают
          // UNSUPPORTED_DATA_TYPE_ACTION.
          enum: [
            "weight", "body-fat", "oxygen-saturation", "heart-rate-variability",
            "daily-oxygen-saturation", "daily-heart-rate-variability", "daily-respiratory-rate",
            "respiratory-rate-sleep-summary", "daily-sleep-temperature-derivations",
            "daily-heart-rate-zones", "daily-vo2-max", "activity-level", "sedentary-period",
            "basal-energy-burned", "altitude", "swim-lengths-data",
            "irregular-rhythm-notification",
            "core-body-temperature", "blood-glucose", "height", "vo2-max", "run-vo2-max",
            "hydration-log", "nutrition-log",
          ],
          description: "Тип данных Google Health",
        },
        start_date: DATE_PROP,
        end_date: DATE_PROP,
      },
      required: ["data_type", "start_date", "end_date"],
    },
  },
  {
    name: "get_device_status",
    description:
      "Статус браслета/устройств Fitbit: модель, батарея, время последней синхронизации. " +
      "Используй для диагностики, когда данных нет или они устарели.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "log_weight",
    description: "Записать вес пользователя (ручной лог в Google Health).",
    inputSchema: {
      type: "object",
      properties: {
        weight_kg: { type: "number", description: "Вес в килограммах, например 82.5" },
        datetime: DATETIME_PROP,
      },
      required: ["weight_kg"],
    },
  },
  {
    name: "log_body_fat",
    description: "Записать процент жира в теле (ручной лог).",
    inputSchema: {
      type: "object",
      properties: {
        percentage: { type: "number", description: "Процент жира, 0–100" },
        datetime: DATETIME_PROP,
      },
      required: ["percentage"],
    },
  },
  {
    name: "log_water",
    description: "Записать выпитую воду/жидкость (ручной лог гидратации).",
    inputSchema: {
      type: "object",
      properties: {
        volume_ml: { type: "number", description: "Объём в миллилитрах, например 250" },
        datetime: DATETIME_PROP,
      },
      required: ["volume_ml"],
    },
  },
  {
    name: "log_food",
    description:
      "Записать съеденную еду (ручной лог питания): название, приём пищи, калории и БЖУ. " +
      "Калории пользователь увидит в приложении Fitbit рядом с расходом с браслета.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Название блюда, например «Овсянка с ягодами»" },
        meal_type: {
          type: "string",
          enum: ["BREAKFAST", "LUNCH", "DINNER", "SNACK", "ANYTIME"],
          description: "Приём пищи",
        },
        calories_kcal: { type: "number", description: "Энергетическая ценность, ккал" },
        protein_g: { type: "number", description: "Белки, г (опционально)" },
        fat_g: { type: "number", description: "Жиры, г (опционально)" },
        carbs_g: { type: "number", description: "Углеводы, г (опционально)" },
        datetime: DATETIME_PROP,
      },
      required: ["name", "meal_type", "calories_kcal"],
    },
  },
  {
    name: "log_exercise",
    description:
      "Записать тренировку вручную (если браслет её не распознал). " +
      "Типы: RUNNING, WALKING, HIKING, BIKING, SWIMMING, AEROBIC_WORKOUT, WEIGHTS, YOGA, " +
      "PILATES, ELLIPTICAL, TREADMILL_RUNNING, SPINNING, MARTIAL_ARTS, TENNIS, WORKOUT и др.",
    inputSchema: {
      type: "object",
      properties: {
        exercise_type: { type: "string", description: "Тип тренировки (enum Google Health, напр. RUNNING)" },
        name: { type: "string", description: "Название, например «Вечерняя пробежка» (опционально)" },
        start: { ...DATETIME_PROP, description: "Начало тренировки, ISO 8601 с часовым поясом" },
        end: { ...DATETIME_PROP, description: "Конец тренировки, ISO 8601 с часовым поясом" },
        calories_kcal: { type: "number", description: "Сожжённые калории (опционально)" },
        distance_km: { type: "number", description: "Дистанция в км (опционально)" },
        avg_heart_rate: { type: "number", description: "Средний пульс (опционально)" },
      },
      required: ["exercise_type", "start", "end"],
    },
  },
  {
    name: "log_mood",
    description: "Записать настроение (одно или несколько значений из списка Google Health).",
    inputSchema: {
      type: "object",
      properties: {
        moods: {
          type: "array",
          items: { type: "string", enum: MOOD_VALUES },
          description: "Настроения, например [\"HAPPY\", \"ENERGIZED\"]",
        },
        datetime: DATETIME_PROP,
      },
      required: ["moods"],
    },
  },
  {
    name: "log_symptom",
    description: "Записать симптомы самочувствия (значения из списка Google Health).",
    inputSchema: {
      type: "object",
      properties: {
        symptoms: {
          type: "array",
          items: { type: "string", enum: SYMPTOM_VALUES },
          description: "Симптомы, например [\"HEADACHE\", \"FATIGUE\"]",
        },
        datetime: DATETIME_PROP,
      },
      required: ["symptoms"],
    },
  },
  {
    name: "delete_log",
    description:
      "Удалить ранее созданные ЭТИМ коннектором записи (вес, еду, воду, тренировку и т.п.). " +
      "Передай resource name точек — поле `name` из ответа get_metric/get_exercises, а для " +
      "настроений и симптомов — из createdPoint в ответе log_mood/log_symptom (читать их API не даёт). " +
      "Данные самого браслета удалить нельзя.",
    inputSchema: {
      type: "object",
      properties: {
        data_type: {
          type: "string",
          enum: ["weight", "body-fat", "hydration-log", "nutrition-log", "exercise", "moods", "symptoms"],
          description: "Тип данных удаляемых точек",
        },
        names: {
          type: "array",
          items: { type: "string" },
          description: "Resource names точек (users/…/dataTypes/…/dataPoints/…), максимум 100",
        },
      },
      required: ["data_type", "names"],
    },
  },
];

// ---------- Реализации ----------

/** Убирает служебный шум из сырых точек. `name` сохраняем — он нужен,
 *  чтобы удалять свои записи через delete_log. */
function compact(value: any): any {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "dataSource" || k === "createTime" || k === "updateTime") continue;
      out[k] = compact(v);
    }
    return out;
  }
  return value;
}

const AZM = (v: any) =>
  v && {
    fatBurn: num(v.sumInFatBurnHeartZone) ?? 0,
    cardio: num(v.sumInCardioHeartZone) ?? 0,
    peak: num(v.sumInPeakHeartZone) ?? 0,
  };

const ACTIVITY_SETTERS: Array<[string, (day: any, p: any) => void]> = [
  ["steps", (d, p) => (d.steps = num(p.steps?.countSum))],
  ["distance", (d, p) => (d.distanceKm = p.distance?.millimetersSum ? +(Number(p.distance.millimetersSum) / 1e6).toFixed(2) : undefined)],
  ["active-energy-burned", (d, p) => (d.activeCaloriesKcal = num(p.activeEnergyBurned?.kcalSum))],
  ["total-calories", (d, p) => (d.totalCaloriesKcal = num(p.totalCalories?.kcalSum))],
  ["floors", (d, p) => (d.floors = num(p.floors?.countSum))],
  ["active-zone-minutes", (d, p) => (d.activeZoneMinutes = AZM(p.activeZoneMinutes))],
];

function daysFromRollups(results: any[]): { days: any[]; warnings: string[] } {
  const days: Record<string, any> = {};
  const warnings: string[] = [];
  results.forEach((points, i) => {
    if (!Array.isArray(points)) {
      if (points?._error) warnings.push(points._error);
      return;
    }
    for (const p of points) {
      const date = rollupDate(p);
      if (!date) continue;
      ACTIVITY_SETTERS[i][1]((days[date] ??= { date }), p);
    }
  });
  return {
    days: Object.values(days).sort((a: any, b: any) => a.date.localeCompare(b.date)),
    warnings,
  };
}

async function getActivity(env: any, props: any, args: any) {
  const start = assertDate(args.start_date, "start_date");
  const end = assertDate(args.end_date, "end_date");
  if (end < start) throw new HealthApiError(`end_date (${end}) раньше start_date (${start})`);
  // 90 дней — лимит роллапа API; более длинный период раздул бы число
  // под-запросов воркера из-за кусков по 14 дней у total-calories.
  if (addDays(start, 89) < end) {
    throw new HealthApiError(
      "Период get_activity не может быть длиннее 90 дней — запроси частями (например, по кварталу).",
    );
  }

  const fetchAll = (family?: string) =>
    Promise.all(
      ACTIVITY_SETTERS.map(([t]) =>
        dailyRollUp(env, props, t, start, end, family).catch((e) => ({ _error: String(e.message || e) })),
      ),
    );

  // Сначала штатная агрегация по всем источникам; если она пуста — пробуем
  // явно семейство google-wearables: у свежих устройств фильтр «носился ли
  // браслет» в агрегате all-sources иногда отстаёт от данных.
  let sourceFamily = "all-sources";
  let { days, warnings } = daysFromRollups(await fetchAll());
  if (!days.length) {
    const retry = daysFromRollups(await fetchAll("google-wearables"));
    if (retry.days.length) ({ days, warnings } = retry), (sourceFamily = "google-wearables");
    else warnings = [...warnings, ...retry.warnings.filter((w) => !warnings.includes(w))];
  }

  // Если агрегаты пусты в обоих режимах — смотрим, есть ли вообще сырые
  // точки шагов в облаке, чтобы отличить «не синхронизировано» от «не посчитано».
  let diagnostics: string | undefined;
  if (!days.length && !warnings.length) {
    const rawSteps = await listDataPoints(
      env, props, "steps",
      `steps.interval.civil_start_time >= "${start}" AND steps.interval.civil_start_time < "${addDays(end, 1)}"`,
      { pageSize: 500, maxPages: 1 },
    ).catch(() => []);
    diagnostics = rawSteps.length
      ? `Сырые точки шагов за период в облаке ЕСТЬ (${rawSteps.length} шт.), но суточные сводки Google ещё не рассчитаны. ` +
        "Обычно это задержка обработки — повторите запрос позже."
      : "Сырых точек шагов в облаке нет — данные браслета не синхронизированы. " +
        "Откройте приложение Fitbit на телефоне и дождитесь синхронизации; статус устройства покажет get_device_status.";
  }

  return {
    period: { start, end },
    sourceFamily,
    days,
    ...(warnings.length ? { warnings } : {}),
    ...(diagnostics ? { diagnostics } : {}),
    note: "Дни без записей отсутствуют в списке: браслет в эти дни не носился или данные ещё не синхронизированы.",
  };
}

async function getDeviceStatus(env: any, props: any, _args: any) {
  const resp = await apiCall(env, props, "/users/me/pairedDevices").catch((e) => {
    if (String(e.message || e).includes("403")) {
      throw new HealthApiError(
        "Нет разрешения на чтение устройств. Переподключи коннектор в настройках Claude " +
          "(Disconnect → Connect), чтобы выдать новое разрешение «настройки».",
      );
    }
    throw e;
  });
  const devices = (resp.pairedDevices || resp.devices || []).map((d: any) => ({
    device: d.deviceVersion,
    type: d.deviceType,
    battery: d.batteryStatus,
    batteryLevel: d.batteryLevel,
    lastSyncTime: d.lastSyncTime,
  }));
  return devices.length
    ? { devices, note: "lastSyncTime — когда браслет последний раз синхронизировался с приложением Fitbit." }
    : { devices, note: "Устройства не найдены — проверь, что браслет привязан к этому Google-аккаунту." };
}

function simplifySleep(p: any, includeStages: boolean) {
  const s = p.sleep;
  if (!s) return null;
  return {
    start: fmtCivil(s.interval?.civilStartTime) || s.interval?.startTime,
    end: fmtCivil(s.interval?.civilEndTime) || s.interval?.endTime,
    mainSleep: s.metadata?.mainSleep,
    type: s.type,
    minutesAsleep: num(s.summary?.minutesAsleep),
    minutesAwake: num(s.summary?.minutesAwake),
    minutesToFallAsleep: num(s.summary?.minutesToFallAsleep),
    minutesInSleepPeriod: num(s.summary?.minutesInSleepPeriod),
    stagesSummary: compact(s.summary?.stagesSummary),
    ...(includeStages
      ? {
          stages: (s.stages || []).map((st: any) => ({
            type: st.type,
            start: st.startTime,
            end: st.endTime,
          })),
        }
      : {}),
  };
}

async function getSleep(env: any, props: any, args: any) {
  const start = assertDate(args.start_date, "start_date");
  const end = assertDate(args.end_date, "end_date");
  const filter =
    `sleep.interval.civil_end_time >= "${start}" AND sleep.interval.civil_end_time < "${addDays(end, 1)}"`;
  const points = await listDataPoints(env, props, "sleep", filter, { pageSize: 25, maxPages: 8 });
  return {
    period: { start, end },
    sessions: points.map((p) => simplifySleep(p, !!args.include_stages)).filter(Boolean),
  };
}

async function getHeartRate(env: any, props: any, args: any) {
  const date = assertDate(args.date, "date");
  const next = addDays(date, 1);

  const [restingPoints, samples] = await Promise.all([
    listDataPoints(
      env, props, "daily-resting-heart-rate",
      `daily_resting_heart_rate.date >= "${date}" AND daily_resting_heart_rate.date < "${next}"`,
      { pageSize: 10 },
    ).catch(() => []),
    listDataPoints(
      env, props, "heart-rate",
      `heart_rate.sample_time.civil_time >= "${date}" AND heart_rate.sample_time.civil_time < "${next}"`,
      { pageSize: 10000, maxPages: 3 },
    ),
  ]);

  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  const hours: Record<number, { min: number; max: number; sum: number; count: number }> = {};
  for (const p of samples) {
    const bpm = Number(p.heartRate?.beatsPerMinute);
    if (!bpm) continue;
    min = Math.min(min, bpm);
    max = Math.max(max, bpm);
    sum += bpm;
    count++;
    const h = p.heartRate?.sampleTime?.civilTime?.time?.hours ?? 0;
    const bucket = (hours[h] ??= { min: bpm, max: bpm, sum: 0, count: 0 });
    bucket.min = Math.min(bucket.min, bpm);
    bucket.max = Math.max(bucket.max, bpm);
    bucket.sum += bpm;
    bucket.count++;
  }

  return {
    date,
    restingHeartRate: num(restingPoints[0]?.dailyRestingHeartRate?.beatsPerMinute),
    samples: count,
    ...(count
      ? {
          min,
          max,
          avg: Math.round(sum / count),
          hourly: Object.entries(hours)
            .map(([h, b]) => ({ hour: +h, min: b.min, max: b.max, avg: Math.round(b.sum / b.count) }))
            .sort((a, b) => a.hour - b.hour),
        }
      : { note: "Записей пульса за этот день нет." }),
  };
}

async function getExercises(env: any, props: any, args: any) {
  const start = assertDate(args.start_date, "start_date");
  const end = assertDate(args.end_date, "end_date");
  const filter =
    `exercise.interval.civil_start_time >= "${start}" AND exercise.interval.civil_start_time < "${addDays(end, 1)}"`;
  const points = await listDataPoints(env, props, "exercise", filter, { pageSize: 25, maxPages: 8 });
  return {
    period: { start, end },
    exercises: points
      .map((p) => {
        const e = p.exercise;
        if (!e) return null;
        const m = e.metricsSummary || {};
        return {
          name: e.displayName,
          type: e.exerciseType,
          start: fmtCivil(e.interval?.civilStartTime) || e.interval?.startTime,
          end: fmtCivil(e.interval?.civilEndTime) || e.interval?.endTime,
          activeDuration: e.activeDuration,
          caloriesKcal: num(m.caloriesKcal),
          distanceKm: m.distanceMillimeters ? +(m.distanceMillimeters / 1e6).toFixed(2) : undefined,
          steps: num(m.steps),
          avgHeartRate: num(m.averageHeartRateBeatsPerMinute),
          activeZoneMinutes: num(m.activeZoneMinutes),
          elevationGainM: m.elevationGainMillimeters ? +(m.elevationGainMillimeters / 1000).toFixed(1) : undefined,
        };
      })
      .filter(Boolean),
  };
}

/** Как фильтровать разные категории типов данных. */
const METRIC_FILTER_FIELD: Record<string, (snake: string) => string> = {
  sample: (s) => `${s}.sample_time.civil_time`,
  daily: (s) => `${s}.date`,
  session: (s) => `${s}.interval.civil_start_time`,
  interval: (s) => `${s}.interval.civil_start_time`,
};
const METRIC_KIND: Record<string, keyof typeof METRIC_FILTER_FIELD> = {
  "weight": "sample", "body-fat": "sample", "oxygen-saturation": "sample",
  "heart-rate-variability": "sample", "core-body-temperature": "sample",
  "blood-glucose": "sample", "height": "sample", "vo2-max": "sample", "run-vo2-max": "sample",
  "respiratory-rate-sleep-summary": "sample",
  "daily-oxygen-saturation": "daily", "daily-heart-rate-variability": "daily",
  "daily-respiratory-rate": "daily", "daily-sleep-temperature-derivations": "daily",
  "daily-heart-rate-zones": "daily", "daily-vo2-max": "daily", "activity-level": "interval",
  "hydration-log": "session", "nutrition-log": "session",
  "irregular-rhythm-notification": "session",
  "sedentary-period": "interval",
  "basal-energy-burned": "interval",
  "altitude": "interval", "swim-lengths-data": "interval",
};

/** Поминутные типы дают тысячи точек в день — режем страницу, чтобы ответ
 *  инструмента не разрастался на сотни килобайт. */
const METRIC_PAGE_LIMIT: Record<string, { pageSize: number; maxPages: number }> = {
  "activity-level": { pageSize: 200, maxPages: 1 },
};

async function getMetric(env: any, props: any, args: any) {
  const dataType = args.data_type;
  const kind = METRIC_KIND[dataType];
  if (!kind) throw new HealthApiError(`Неизвестный data_type: ${dataType}`);
  const start = assertDate(args.start_date, "start_date");
  const end = assertDate(args.end_date, "end_date");
  const snake = dataType.replace(/-/g, "_");
  const field = METRIC_FILTER_FIELD[kind](snake);
  const filter = `${field} >= "${start}" AND ${field} < "${addDays(end, 1)}"`;
  const limit = METRIC_PAGE_LIMIT[dataType] ?? { pageSize: kind === "session" ? 25 : 1000, maxPages: 5 };
  const points = await listDataPoints(env, props, dataType, filter, limit);
  return { period: { start, end }, dataType, points: compact(points) };
}

/** Первая точка «суточного» типа данных за конкретную дату (или null). */
async function dailyPoint(env: any, props: any, dataType: string, date: string): Promise<any | null> {
  const snake = dataType.replace(/-/g, "_");
  const points = await listDataPoints(
    env, props, dataType,
    `${snake}.date >= "${date}" AND ${snake}.date < "${addDays(date, 1)}"`,
    { pageSize: 10, maxPages: 1 },
  ).catch(() => []);
  const field = snake.replace(/_([a-z0-9])/g, (_: string, c: string) => c.toUpperCase());
  return points[0]?.[field] ? compact(points[0][field]) : null;
}

async function getDailySummary(env: any, props: any, args: any) {
  const date = args.date ? assertDate(args.date, "date") : todayUtc();
  const next = addDays(date, 1);

  const [activity, sleep, heartRate, weightPoints, spo2, hrv, skinTemp, respRate, afib] = await Promise.all([
    getActivity(env, props, { start_date: date, end_date: date }).catch((e) => ({ _error: String(e.message || e) })),
    getSleep(env, props, { start_date: date, end_date: date }).catch((e) => ({ _error: String(e.message || e) })),
    getHeartRate(env, props, { date }).catch((e) => ({ _error: String(e.message || e) })),
    listDataPoints(
      env, props, "weight",
      `weight.sample_time.civil_time >= "${date}" AND weight.sample_time.civil_time < "${next}"`,
      { pageSize: 20 },
    ).catch(() => []),
    dailyPoint(env, props, "daily-oxygen-saturation", date),
    dailyPoint(env, props, "daily-heart-rate-variability", date),
    dailyPoint(env, props, "daily-sleep-temperature-derivations", date),
    dailyPoint(env, props, "daily-respiratory-rate", date),
    listDataPoints(
      env, props, "irregular-rhythm-notification",
      `irregular_rhythm_notification.interval.civil_start_time >= "${date}" AND ` +
        `irregular_rhythm_notification.interval.civil_start_time < "${next}"`,
      { pageSize: 25, maxPages: 1 },
    ).catch(() => []),
  ]);

  const day = (activity as any)?.days?.[0];
  return {
    date,
    activity: (activity as any)?._error ?? day ?? "нет данных за этот день",
    sleep: (sleep as any)?._error ?? ((sleep as any)?.sessions?.length ? (sleep as any).sessions : "нет записей сна"),
    heartRate: (heartRate as any)?._error ?? heartRate,
    oxygenSaturation: spo2 ?? undefined,
    heartRateVariability: hrv ?? undefined,
    sleepSkinTemperature: skinTemp ?? undefined,
    respiratoryRate: respRate ?? undefined,
    afibAlerts: afib.length
      ? { count: afib.length, alerts: compact(afib) }
      : "нет уведомлений об аритмии за этот день",
    weightKg: weightPoints[0]?.weight?.weightGrams
      ? +(Number(weightPoints[0].weight.weightGrams) / 1000).toFixed(1)
      : undefined,
  };
}

// ---------- Запись (ручные логи) ----------

/** Единый ответ инструментов записи: запись асинхронная. */
function createdResponse(op: any, summary: string) {
  return {
    status: "created",
    note: `${summary}. Запись обрабатывается Google Health асинхронно — в выдаче появится через несколько секунд.`,
    operation: op?.name,
    done: op?.done,
    createdPoint: op?.response ? compact(op.response) : undefined,
  };
}

async function logWeight(env: any, props: any, args: any) {
  const kg = Number(args.weight_kg);
  if (!kg || kg <= 0 || kg > 500) throw new HealthApiError(`Некорректный вес: ${args.weight_kg}`);
  const op = await createDataPoint(env, props, "weight", {
    weight: { weightGrams: Math.round(kg * 1000), sampleTime: toSampleTime(args.datetime) },
  });
  return createdResponse(op, `Вес ${kg} кг записан`);
}

async function logBodyFat(env: any, props: any, args: any) {
  const pct = Number(args.percentage);
  if (!(pct > 0 && pct < 100)) throw new HealthApiError(`Некорректный процент жира: ${args.percentage}`);
  const op = await createDataPoint(env, props, "body-fat", {
    bodyFat: { percentage: pct, sampleTime: toSampleTime(args.datetime) },
  });
  return createdResponse(op, `Процент жира ${pct}% записан`);
}

async function logWater(env: any, props: any, args: any) {
  const ml = Number(args.volume_ml);
  if (!ml || ml <= 0 || ml > 10000) throw new HealthApiError(`Некорректный объём: ${args.volume_ml}`);
  const op = await createDataPoint(env, props, "hydration-log", {
    hydrationLog: {
      interval: toSessionInterval(args.datetime),
      amountConsumed: { milliliters: ml },
    },
  });
  return createdResponse(op, `${ml} мл жидкости записано`);
}

async function logFood(env: any, props: any, args: any) {
  const kcal = Number(args.calories_kcal);
  if (!(kcal >= 0)) throw new HealthApiError(`Некорректные калории: ${args.calories_kcal}`);
  const nutrients = args.protein_g
    ? [{ nutrient: "PROTEIN", quantity: { grams: Number(args.protein_g) } }]
    : undefined;
  const op = await createDataPoint(env, props, "nutrition-log", {
    nutritionLog: {
      interval: toSessionInterval(args.datetime),
      foodDisplayName: String(args.name),
      mealType: args.meal_type || "ANYTIME",
      energy: { kcal },
      ...(args.fat_g ? { totalFat: { grams: Number(args.fat_g) } } : {}),
      ...(args.carbs_g ? { totalCarbohydrate: { grams: Number(args.carbs_g) } } : {}),
      ...(nutrients ? { nutrients } : {}),
    },
  });
  return createdResponse(op, `«${args.name}» (${kcal} ккал, ${args.meal_type}) записано`);
}

async function logExercise(env: any, props: any, args: any) {
  const type = String(args.exercise_type || "").toUpperCase().replace(/[\s-]+/g, "_");
  if (!type) throw new HealthApiError("Не указан exercise_type");
  const m: any = {};
  if (args.calories_kcal) m.caloriesKcal = Number(args.calories_kcal);
  if (args.distance_km) m.distanceMillimeters = Math.round(Number(args.distance_km) * 1e6);
  if (args.avg_heart_rate) m.averageHeartRateBeatsPerMinute = String(Math.round(Number(args.avg_heart_rate)));
  const op = await createDataPoint(env, props, "exercise", {
    exercise: {
      interval: toSessionInterval(args.start, args.end),
      exerciseType: type,
      displayName: args.name || type,
      ...(Object.keys(m).length ? { metricsSummary: m } : {}),
    },
  });
  return createdResponse(op, `Тренировка ${args.name || type} записана`);
}

async function logMood(env: any, props: any, args: any) {
  const moods = (args.moods || []).map((v: string) => String(v).toUpperCase());
  if (!moods.length) throw new HealthApiError("Список moods пуст");
  const op = await createDataPoint(env, props, "moods", {
    moods: { moods, sampleTime: toSampleTime(args.datetime) },
  });
  return createdResponse(op, `Настроение (${moods.join(", ")}) записано`);
}

async function logSymptom(env: any, props: any, args: any) {
  const symptoms = (args.symptoms || []).map((v: string) => String(v).toUpperCase());
  if (!symptoms.length) throw new HealthApiError("Список symptoms пуст");
  const op = await createDataPoint(env, props, "symptoms", {
    symptoms: { symptoms, sampleTime: toSampleTime(args.datetime) },
  });
  return createdResponse(op, `Симптомы (${symptoms.join(", ")}) записаны`);
}

async function deleteLog(env: any, props: any, args: any) {
  const names = args.names || [];
  if (!names.length) throw new HealthApiError("Не переданы names удаляемых точек");
  if (names.length > 100) throw new HealthApiError("За один раз можно удалить не более 100 точек");
  await batchDeleteDataPoints(env, props, args.data_type, names);
  return {
    status: "deleted",
    note: `Удалено точек: ${names.length}. Удаляются только записи, созданные этим коннектором; ` +
      "чужие точки в запросе игнорируются или дают ошибку.",
  };
}

const IMPLEMENTATIONS: Record<string, (env: any, props: any, args: any) => Promise<any>> = {
  get_daily_summary: getDailySummary,
  get_activity: getActivity,
  get_sleep: getSleep,
  get_heart_rate: getHeartRate,
  get_exercises: getExercises,
  get_metric: getMetric,
  get_device_status: getDeviceStatus,
  log_weight: logWeight,
  log_body_fat: logBodyFat,
  log_water: logWater,
  log_food: logFood,
  log_exercise: logExercise,
  log_mood: logMood,
  log_symptom: logSymptom,
  delete_log: deleteLog,
};

export async function callTool(name: string, args: any, env: any, props: any): Promise<any> {
  const impl = IMPLEMENTATIONS[name];
  if (!impl) throw new HealthApiError(`Неизвестный инструмент: ${name}`);
  return impl(env, props, args || {});
}

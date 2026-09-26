/**
 * Минимальный MCP-сервер (Streamable HTTP, stateless) на /mcp.
 *
 * claude.ai шлёт JSON-RPC 2.0 сообщения POST-запросами; отвечаем обычным
 * application/json (SSE-стрим для read-only инструментов не нужен, GET → 405).
 * Авторизацию уже проверил OAuthProvider — токены Google лежат в ctx.props.
 */
import { TOOLS, callTool } from "./tools";

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_VERSION = "2025-06-18";

const SERVER_INFO = { name: "fitbit-air-google-health", version: "2.2.1" };

const INSTRUCTIONS =
  "Данные браслета Fitbit Air из Google Health API: чтение (активность, сон, пульс, SpO2, HRV, " +
  "температура кожи, AFib-уведомления и др.) и ручные логи (вес, еда, вода, тренировки, " +
  "настроение, симптомы). Даты — YYYY-MM-DD в локальном времени пользователя; в log_*-инструментах " +
  "передавай datetime в ISO 8601 с часовым поясом пользователя. Для вопроса «как прошёл день» " +
  "начинай с get_daily_summary; для трендов — get_activity/get_sleep за период. " +
  "Коннектор может удалять только записи, созданные им самим (delete_log).";

function rpcResult(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(msg: any, env: any, props: any): Promise<any | undefined> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") {
    return rpcError(msg?.id ?? null, -32600, "Invalid Request");
  }

  if (msg.method === "initialize") {
    const requested = msg.params?.protocolVersion;
    return rpcResult(msg.id, {
      protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    });
  }

  // Уведомления (нет id) — принимаем и молчим.
  if (msg.id === undefined || msg.id === null) return undefined;

  switch (msg.method) {
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: TOOLS });
    case "tools/call": {
      const name = msg.params?.name;
      try {
        const result = await callTool(name, msg.params?.arguments || {}, env, props);
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 1) }],
        });
      } catch (e: any) {
        return rpcResult(msg.id, {
          content: [{ type: "text", text: `Ошибка: ${e?.message || e}` }],
          isError: true,
        });
      }
    }
    case "resources/list":
      return rpcResult(msg.id, { resources: [] });
    case "resources/templates/list":
      return rpcResult(msg.id, { resourceTemplates: [] });
    case "prompts/list":
      return rpcResult(msg.id, { prompts: [] });
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export const mcpHandler = {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    if (request.method === "DELETE") return new Response(null, { status: 200 });
    if (request.method !== "POST") {
      return new Response("Method Not Allowed: этот сервер принимает только POST", { status: 405 });
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
    }

    const props = ctx.props;
    const messages = Array.isArray(payload) ? payload : [payload];
    const responses = (
      await Promise.all(messages.map((m) => handleMessage(m, env, props)))
    ).filter((r) => r !== undefined);

    if (responses.length === 0) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(payload) ? responses : responses[0]);
  },
};

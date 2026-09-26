/**
 * Коннектор Claude ⇄ Fitbit Air (Google Health API).
 *
 * Устройство:
 *  - OAuthProvider (@cloudflare/workers-oauth-provider) делает воркер
 *    полноценным OAuth-сервером для claude.ai: /authorize, /token, /register.
 *  - При авторизации пользователь перенаправляется в Google (google-auth.ts),
 *    полученные токены Google сохраняются в props гранта.
 *  - Запросы к /mcp — это MCP-протокол (mcp-server.ts): claude.ai ходит сюда
 *    с bearer-токеном, библиотека проверяет его и подкладывает props.
 */
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { GoogleAuthHandler } from "./google-auth";
import { mcpHandler } from "./mcp-server";

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: mcpHandler as any,
  defaultHandler: GoogleAuthHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

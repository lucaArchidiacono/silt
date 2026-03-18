import type { JsEntry } from "../../napi";

type NativeBindings = typeof import("../../napi");
type Entry = JsEntry;
type SettingsChangedPayload = {
  scope?: "sync" | "ai" | "general";
};

declare global {
  interface Window {
    require?: NodeJS.Require;
  }
}

const runtimeRequire = window.require;
if (!runtimeRequire) {
  throw new Error("Electron node integration is required for the current renderer architecture.");
}

const path = runtimeRequire("node:path") as typeof import("node:path");
const http = runtimeRequire("node:http") as typeof import("node:http");
const { randomBytes, createHash } = runtimeRequire("node:crypto") as typeof import("node:crypto");
const { clipboard, ipcRenderer, shell } =
  runtimeRequire("electron") as typeof import("electron");

const native = runtimeRequire(
  path.resolve(process.cwd(), "..", "napi"),
) as NativeBindings;

const {
  SiltSession,
  getConfig: nativeGetConfig,
  setConfig: nativeSetConfig,
  syncPushEntries: nativeSyncPushEntries,
  syncPushAll: nativeSyncPushAll,
  syncPullAsync: nativeSyncPullAsync,
  syncPushEntriesGdrive: nativeSyncPushEntriesGdrive,
  syncPushAllGdrive: nativeSyncPushAllGdrive,
  syncPullAsyncGdrive: nativeSyncPullAsyncGdrive,
  getLogs: nativeGetLogs,
  clearLogs: nativeClearLogs,
  aiQuery: nativeAiQuery,
} = native;

const silt = new SiltSession();

const DROPBOX_APP_KEY = "yo99v8km1tmfhjj";
const DROPBOX_REDIRECT_PORT = 18457;
const DROPBOX_REDIRECT_URI = `http://127.0.0.1:${DROPBOX_REDIRECT_PORT}/callback`;

const GDRIVE_CLIENT_ID =
  "472212712976-0re1irdle5up1o6cm1v1ujma9eppufr3.apps.googleusercontent.com";
const GDRIVE_CLIENT_SECRET = "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";
const GDRIVE_REDIRECT_PORT = 18457;
const GDRIVE_REDIRECT_URI = `http://127.0.0.1:${GDRIVE_REDIRECT_PORT}/callback`;

function randomUrlSafe(length: number): string {
  return randomBytes(length)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, length);
}

function sha256Base64Url(input: string): string {
  return createHash("sha256")
    .update(input)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function maskSecret(secret: string | null): string {
  if (!secret) return "not connected";
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

function closeServer(server: import("node:http").Server) {
  if (server.listening) {
    server.close();
  }
}

async function runOAuthFlow({
  port,
  redirectUri,
  authUrl,
  exchangeCode,
}: {
  port: number;
  redirectUri: string;
  authUrl: string;
  exchangeCode: (code: string) => Promise<string>;
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const state = randomUrlSafe(32);

    const finish = (error?: unknown, token?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeServer(server);

      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      resolve(token ?? "");
    };

    const server = http.createServer(async (request, response) => {
      const requestUrl = new URL(
        request.url ?? "/",
        `http://127.0.0.1:${port}`,
      );

      if (requestUrl.pathname !== "/callback") {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("Not found");
        return;
      }

      const code = requestUrl.searchParams.get("code");
      const returnedState = requestUrl.searchParams.get("state");

      if (!code || !returnedState || returnedState !== state) {
        response.writeHead(400, { "Content-Type": "text/html" });
        response.end(
          "<html><body style='font-family:system-ui;padding:48px'>Authorization failed.</body></html>",
        );
        finish(new Error("Authorization failed: invalid state or missing code."));
        return;
      }

      try {
        const token = await exchangeCode(code);
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(
          "<html><body style='font-family:system-ui;padding:48px'><h2>Connected</h2><p>You can close this tab and return to Silt.</p></body></html>",
        );
        finish(undefined, token);
      } catch (error) {
        response.writeHead(500, { "Content-Type": "text/html" });
        response.end(
          "<html><body style='font-family:system-ui;padding:48px'>Authorization failed.</body></html>",
        );
        finish(error);
      }
    });

    server.on("error", (error) => {
      finish(error);
    });

    const timer = setTimeout(() => {
      finish(new Error("Authorization timed out."));
    }, 120_000);

    server.listen(port, "127.0.0.1", async () => {
      try {
        await shell.openExternal(
          `${authUrl}${authUrl.includes("?") ? "&" : "?"}redirect_uri=${encodeURIComponent(
            redirectUri,
          )}&state=${state}`,
        );
      } catch (error) {
        finish(error);
      }
    });
  });
}

export type { Entry, SettingsChangedPayload };

export function listEntries(): Entry[] {
  return silt.listEntries();
}

export function newEntry(body: string): Entry {
  return silt.newEntry(body);
}

export function editEntry(id: string, body: string): Entry {
  return silt.editEntry(id, body);
}

export function deleteEntry(id: string): void {
  silt.deleteEntry(id);
}

export function searchEntries(query: string): Entry[] {
  return silt.search(query);
}

export function rebuildIndex(): void {
  silt.rebuildIndex();
}

export function getConfig(key: string): string | null {
  return nativeGetConfig(key);
}

export function setConfig(key: string, value: string): void {
  nativeSetConfig(key, value);
}

export function getLogs(): string[] {
  return nativeGetLogs();
}

export function clearLogs(): void {
  nativeClearLogs();
}

export function copyText(value: string): void {
  clipboard.writeText(value);
}

export function openSettingsWindow(): void {
  ipcRenderer.send("app:open-settings");
}

export function onSettingsChanged(
  listener: (payload: SettingsChangedPayload) => void,
): () => void {
  const handler = (_event: unknown, payload: SettingsChangedPayload) => {
    listener(payload);
  };
  ipcRenderer.on("settings:changed", handler);
  return () => {
    ipcRenderer.removeListener("settings:changed", handler);
  };
}

export function notifySettingsChanged(payload: SettingsChangedPayload): void {
  ipcRenderer.send("settings:changed", payload);
}

export function syncPushEntries(ids: string[]): Promise<number> {
  return nativeSyncPushEntries(ids) as Promise<number>;
}

export function syncPushAll(): Promise<number> {
  return nativeSyncPushAll() as Promise<number>;
}

export function syncPullAsync(): Promise<number> {
  return nativeSyncPullAsync() as Promise<number>;
}

export function syncPushEntriesGDrive(ids: string[]): Promise<number> {
  return nativeSyncPushEntriesGdrive(ids) as Promise<number>;
}

export function syncPushAllGDrive(): Promise<number> {
  return nativeSyncPushAllGdrive() as Promise<number>;
}

export function syncPullAsyncGDrive(): Promise<number> {
  return nativeSyncPullAsyncGdrive() as Promise<number>;
}

export function aiQuery(query: string): Promise<string> {
  return nativeAiQuery(query) as Promise<string>;
}

export function getSyncProviderState() {
  const dropboxToken = getConfig("dropbox_token");
  const gdriveToken = getConfig("google_drive_token");

  return {
    dropboxConnected: Boolean(dropboxToken),
    gdriveConnected: Boolean(gdriveToken),
    dropboxToken,
    gdriveToken,
    dropboxLabel: maskSecret(dropboxToken),
    gdriveLabel: maskSecret(gdriveToken),
  };
}

export function getAiSettings() {
  const provider = getConfig("ai_provider") || "ollama";
  const model = getConfig("ai_model") || "llama3.2";
  const ollamaUrl = getConfig("ollama_url") || "http://localhost:11434";
  const openrouterApiKey = getConfig("openrouter_api_key");

  return {
    provider,
    model,
    ollamaUrl,
    openrouterApiKey,
    openrouterLabel: openrouterApiKey ? maskSecret(openrouterApiKey) : "not set",
  };
}

export function disconnectDropbox(): void {
  setConfig("dropbox_token", "");
  setConfig("dropbox_refresh_token", "");
}

export function disconnectGoogleDrive(): void {
  setConfig("google_drive_token", "");
  setConfig("google_drive_refresh_token", "");
  setConfig("google_drive_folder_id", "");
}

export function saveAiSettings({
  provider,
  model,
  ollamaUrl,
  openrouterApiKey,
}: {
  provider: string;
  model: string;
  ollamaUrl: string;
  openrouterApiKey: string;
}): void {
  setConfig("ai_provider", provider);
  setConfig("ai_model", model);
  if (provider === "ollama") {
    setConfig("ollama_url", ollamaUrl);
  } else {
    setConfig("openrouter_api_key", openrouterApiKey);
  }
}

export async function authDropbox(): Promise<string> {
  const codeVerifier = randomUrlSafe(64);
  const codeChallenge = sha256Base64Url(codeVerifier);

  const authUrl =
    `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}` +
    `&response_type=code` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256` +
    `&token_access_type=offline` +
    `&scope=files.content.write+files.content.read+files.metadata.read`;

  return runOAuthFlow({
    port: DROPBOX_REDIRECT_PORT,
    redirectUri: DROPBOX_REDIRECT_URI,
    authUrl,
    exchangeCode: async (code) => {
      const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: DROPBOX_APP_KEY,
          code_verifier: codeVerifier,
          redirect_uri: DROPBOX_REDIRECT_URI,
        }),
      });

      const payload = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
      };

      if (!response.ok || !payload.access_token) {
        throw new Error("Dropbox authorization failed.");
      }

      setConfig("dropbox_token", payload.access_token);
      if (payload.refresh_token) {
        setConfig("dropbox_refresh_token", payload.refresh_token);
      }

      return payload.access_token;
    },
  });
}

export async function authGoogleDrive(): Promise<string> {
  const codeVerifier = randomUrlSafe(64);
  const codeChallenge = sha256Base64Url(codeVerifier);

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GDRIVE_CLIENT_ID}` +
    `&response_type=code` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&scope=${encodeURIComponent("https://www.googleapis.com/auth/drive.file")}`;

  return runOAuthFlow({
    port: GDRIVE_REDIRECT_PORT,
    redirectUri: GDRIVE_REDIRECT_URI,
    authUrl,
    exchangeCode: async (code) => {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: GDRIVE_CLIENT_ID,
          client_secret: GDRIVE_CLIENT_SECRET,
          code_verifier: codeVerifier,
          redirect_uri: GDRIVE_REDIRECT_URI,
        }),
      });

      const payload = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
      };

      if (!response.ok || !payload.access_token) {
        throw new Error("Google Drive authorization failed.");
      }

      setConfig("google_drive_token", payload.access_token);
      if (payload.refresh_token) {
        setConfig("google_drive_refresh_token", payload.refresh_token);
      }

      return payload.access_token;
    },
  });
}

import { SiltSession, getConfig as nativeGetConfig, setConfig as nativeSetConfig, syncPushEntries as nativeSyncPushEntries, syncPullAsync as nativeSyncPullAsync, syncPushAll as nativeSyncPushAll, syncPushEntriesGdrive as nativeSyncPushEntriesGdrive, syncPullAsyncGdrive as nativeSyncPullAsyncGdrive, syncPushAllGdrive as nativeSyncPushAllGdrive, type JsEntry } from "../../napi"

export type Entry = JsEntry

const silt = new SiltSession()

export function newEntry(body: string): Entry {
  return silt.newEntry(body)
}

export function listEntries(): Entry[] {
  return silt.listEntries()
}

export function searchEntries(query: string): Entry[] {
  return silt.search(query)
}

export function editEntry(id: string, body: string): Entry {
  return silt.editEntry(id, body)
}

export function deleteEntry(id: string): void {
  silt.deleteEntry(id)
}

export function getConfig(key: string): string | null {
  return nativeGetConfig(key)
}

export function setConfig(key: string, value: string): void {
  nativeSetConfig(key, value)
}

export function rebuildIndex(): void {
  silt.rebuildIndex()
}

export function syncPushEntries(ids: string[]): Promise<number> {
  return nativeSyncPushEntries(ids) as Promise<number>
}

export function syncPushAll(): Promise<number> {
  return nativeSyncPushAll() as Promise<number>
}

export function syncPullAsync(): Promise<number> {
  return nativeSyncPullAsync() as Promise<number>
}

const DROPBOX_APP_KEY = "yo99v8km1tmfhjj"
const DROPBOX_REDIRECT_PORT = 18457
const DROPBOX_REDIRECT_URI = `http://localhost:${DROPBOX_REDIRECT_PORT}/callback`

function randomUrlSafe(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, length)
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function authDropbox(): Promise<string> {
  const codeVerifier = randomUrlSafe(64)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const state = randomUrlSafe(32)

  return new Promise<string>((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        server.stop()
        reject(new Error("Authorization timed out"))
      }
    }, 120_000)

    const server = Bun.serve({
      port: DROPBOX_REDIRECT_PORT,
      fetch: async (req) => {
        const url = new URL(req.url)
        if (url.pathname !== "/callback") {
          return new Response("Not found", { status: 404 })
        }

        const code = url.searchParams.get("code")
        const returnedState = url.searchParams.get("state")

        if (!code || returnedState !== state) {
          return new Response("Authorization failed: invalid state or missing code.", {
            status: 400,
            headers: { "Content-Type": "text/html" },
          })
        }

        try {
          const tokenResp = await fetch("https://api.dropboxapi.com/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              grant_type: "authorization_code",
              client_id: DROPBOX_APP_KEY,
              code_verifier: codeVerifier,
              redirect_uri: DROPBOX_REDIRECT_URI,
            }),
          })

          const tokenData = await tokenResp.json() as {
            access_token?: string
            refresh_token?: string
          }

          if (!tokenData.access_token) {
            throw new Error("No access_token in response")
          }

          setConfig("dropbox_token", tokenData.access_token)
          if (tokenData.refresh_token) {
            setConfig("dropbox_refresh_token", tokenData.refresh_token)
          }

          if (!settled) {
            settled = true
            clearTimeout(timer)
            server.stop()
            resolve(tokenData.access_token)
          }

          return new Response(
            "<html><body style='font-family:system-ui;text-align:center;padding:60px'>" +
            "<h2>Connected!</h2><p>You can close this tab and return to silt.</p>" +
            "</body></html>",
            { headers: { "Content-Type": "text/html" } },
          )
        } catch (err) {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            server.stop()
            reject(err)
          }
          return new Response("Authorization failed.", { status: 500 })
        }
      },
    })

    const authUrl =
      `https://www.dropbox.com/oauth2/authorize` +
      `?client_id=${DROPBOX_APP_KEY}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(DROPBOX_REDIRECT_URI)}` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256` +
      `&state=${state}` +
      `&token_access_type=offline` +
      `&scope=files.content.write+files.content.read+files.metadata.read`

    Bun.spawn(["open", authUrl])
  })
}

export function cancelAuth(): void {
  // Placeholder — the timeout in authDropbox handles cleanup
}

// --- Google Drive ---

const GDRIVE_CLIENT_ID = "472212712976-0re1irdle5up1o6cm1v1ujma9eppufr3.apps.googleusercontent.com"
const GDRIVE_CLIENT_SECRET = "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"
const GDRIVE_REDIRECT_PORT = 18457
const GDRIVE_REDIRECT_URI = `http://localhost:${GDRIVE_REDIRECT_PORT}/callback`

export function syncPushEntriesGDrive(ids: string[]): Promise<number> {
  return nativeSyncPushEntriesGdrive(ids) as Promise<number>
}

export function syncPushAllGDrive(): Promise<number> {
  return nativeSyncPushAllGdrive() as Promise<number>
}

export function syncPullAsyncGDrive(): Promise<number> {
  return nativeSyncPullAsyncGdrive() as Promise<number>
}

export async function authGoogleDrive(): Promise<string> {
  const codeVerifier = randomUrlSafe(64)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const state = randomUrlSafe(32)

  return new Promise<string>((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        server.stop()
        reject(new Error("Authorization timed out"))
      }
    }, 120_000)

    const server = Bun.serve({
      port: GDRIVE_REDIRECT_PORT,
      fetch: async (req) => {
        const url = new URL(req.url)
        if (url.pathname !== "/callback") {
          return new Response("Not found", { status: 404 })
        }

        const code = url.searchParams.get("code")
        const returnedState = url.searchParams.get("state")

        if (!code || returnedState !== state) {
          return new Response("Authorization failed: invalid state or missing code.", {
            status: 400,
            headers: { "Content-Type": "text/html" },
          })
        }

        try {
          const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
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
          })

          const tokenData = await tokenResp.json() as {
            access_token?: string
            refresh_token?: string
          }

          if (!tokenData.access_token) {
            throw new Error("No access_token in response")
          }

          setConfig("google_drive_token", tokenData.access_token)
          if (tokenData.refresh_token) {
            setConfig("google_drive_refresh_token", tokenData.refresh_token)
          }

          if (!settled) {
            settled = true
            clearTimeout(timer)
            server.stop()
            resolve(tokenData.access_token)
          }

          return new Response(
            "<html><body style='font-family:system-ui;text-align:center;padding:60px'>" +
            "<h2>Connected!</h2><p>You can close this tab and return to silt.</p>" +
            "</body></html>",
            { headers: { "Content-Type": "text/html" } },
          )
        } catch (err) {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            server.stop()
            reject(err)
          }
          return new Response("Authorization failed.", { status: 500 })
        }
      },
    })

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${GDRIVE_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(GDRIVE_REDIRECT_URI)}` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256` +
      `&state=${state}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&scope=${encodeURIComponent("https://www.googleapis.com/auth/drive.file")}`

    Bun.spawn(["open", authUrl])
  })
}

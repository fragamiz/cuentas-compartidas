import { env } from "cloudflare:workers";

const SESSION_COOKIE = "cc_dropbox_session";
const OAUTH_COOKIE = "cc_dropbox_oauth";
const FILE_PATH = "/cuentas-compartidas.json";

type Session = { refreshToken: string; accountId: string };

function settings() {
  const { DROPBOX_APP_KEY, DROPBOX_APP_SECRET, SESSION_KEY } = env;
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !SESSION_KEY) throw new Error("Falta configurar Dropbox.");
  return { appKey: DROPBOX_APP_KEY, appSecret: DROPBOX_APP_SECRET, sessionKey: SESSION_KEY };
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBytes(value: string) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function sessionKey() {
  const raw = base64ToBytes(settings().sessionKey);
  if (raw.length !== 32) throw new Error("SESSION_KEY debe contener 32 bytes en base64url.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealSession(session: Session) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sessionKey(), new TextEncoder().encode(JSON.stringify(session)));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function readSession(request: Request): Promise<Session | null> {
  const value = cookie(request, SESSION_COOKIE);
  if (!value) return null;
  try {
    const [iv, data] = value.split(".");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await sessionKey(), base64ToBytes(data));
    const session = JSON.parse(new TextDecoder().decode(plain)) as Session;
    return session.refreshToken && session.accountId ? session : null;
  } catch { return null; }
}

function secureCookie(request: Request) { return new URL(request.url).protocol === "https:" ? "; Secure" : ""; }
export function sessionCookie(request: Request, value: string) { return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secureCookie(request)}`; }
export function clearSessionCookie(request: Request) { return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie(request)}`; }
export function oauthCookie(request: Request, value: string) { return `${OAUTH_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/dropbox; Max-Age=600${secureCookie(request)}`; }
export function clearOauthCookie(request: Request) { return `${OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/auth/dropbox; Max-Age=0${secureCookie(request)}`; }
export function readOauthCookie(request: Request) { return cookie(request, OAUTH_COOKIE); }
export function appKey() { return settings().appKey; }
export function redirectUri(request: Request) { return `${new URL(request.url).origin}/api/auth/dropbox/callback`; }

export async function tokenRequest(params: URLSearchParams) {
  const { appKey, appSecret } = settings();
  const body = new URLSearchParams(params);
  body.set("client_id", appKey);
  body.set("client_secret", appSecret);
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
  });
  if (!response.ok) {
    const result = await response.text();
    let reason = "unknown";
    try {
      const error = JSON.parse(result) as { error?: unknown; error_description?: unknown };
      reason = [error.error, error.error_description].filter((part): part is string => typeof part === "string").join(": ") || reason;
    } catch { /* Dropbox did not return JSON. */ }
    for (const value of body.values()) if (value.length > 5) reason = reason.replaceAll(value, "[redacted]");
    throw new Error(`Dropbox OAuth: ${response.status} ${reason.slice(0, 240)}`);
  }
  return response.json() as Promise<{ access_token: string; refresh_token?: string; account_id?: string }>;
}

export async function accessToken(request: Request) {
  const session = await readSession(request);
  if (!session) return null;
  const token = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }));
  return token.access_token;
}

export async function downloadState(token: string) {
  return fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "dropbox-api-arg": JSON.stringify({ path: FILE_PATH }) },
  });
}

export async function uploadState(token: string, data: string, revision: string) {
  return fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST", headers: {
      authorization: `Bearer ${token}`, "content-type": "application/octet-stream",
      "dropbox-api-arg": JSON.stringify({ path: FILE_PATH, mode: revision ? { ".tag": "update", update: revision } : "add", autorename: false, strict_conflict: true, mute: true }),
    }, body: data,
  });
}


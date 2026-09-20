import { clearOauthCookie, readOauthCookie, redirectUri, sealSession, sessionCookie, tokenRequest } from "../../../../../lib/dropbox";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = readOauthCookie(request);
  const headers = new Headers({ Location: new URL("/", url).toString() });
  headers.append("Set-Cookie", clearOauthCookie(request));
  if (!expected || url.searchParams.get("state") !== expected || !url.searchParams.get("code")) {
    return Response.json({ error: "No se pudo verificar la autorización de Dropbox." }, { status: 400, headers: { "set-cookie": clearOauthCookie(request) } });
  }
  try {
    const token = await tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code")!, redirect_uri: redirectUri(request) }));
    if (!token.refresh_token || !token.account_id) throw new Error("Dropbox no devolvió una sesión completa.");
    headers.append("Set-Cookie", sessionCookie(request, await sealSession({ refreshToken: token.refresh_token, accountId: token.account_id })));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("dropbox.callback", error);
    return Response.json({ error: "No se pudo completar la conexión con Dropbox." }, { status: 502, headers: { "set-cookie": clearOauthCookie(request) } });
  }
}


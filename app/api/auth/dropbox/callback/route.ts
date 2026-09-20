import { clearOauthCookie, readOauthCookie, redirectUri, sealSession, sessionCookie, tokenRequest } from "../../../../../lib/dropbox";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = readOauthCookie(request);
  const response = Response.redirect(new URL("/", url), 302);
  response.headers.append("set-cookie", clearOauthCookie(request));
  if (!expected || url.searchParams.get("state") !== expected || !url.searchParams.get("code")) {
    return Response.json({ error: "No se pudo verificar la autorización de Dropbox." }, { status: 400, headers: { "set-cookie": clearOauthCookie(request) } });
  }
  try {
    const token = await tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code")!, redirect_uri: redirectUri(request) }));
    if (!token.refresh_token || !token.account_id) throw new Error("Dropbox no devolvió una sesión completa.");
    response.headers.append("set-cookie", sessionCookie(request, await sealSession({ refreshToken: token.refresh_token, accountId: token.account_id })));
    return response;
  } catch (error) {
    console.error("dropbox.callback", error);
    return Response.json({ error: "No se pudo completar la conexión con Dropbox." }, { status: 502, headers: { "set-cookie": clearOauthCookie(request) } });
  }
}

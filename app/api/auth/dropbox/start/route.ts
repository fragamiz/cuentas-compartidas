import { appKey, oauthCookie, redirectUri } from "../../../../../lib/dropbox";

export async function GET(request: Request) {
  const state = crypto.randomUUID();
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", appKey());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("state", state);
  const response = Response.redirect(url, 302);
  response.headers.append("set-cookie", oauthCookie(request, state));
  return response;
}

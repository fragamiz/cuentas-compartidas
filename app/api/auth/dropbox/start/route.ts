import { appKey, oauthCookie, redirectUri } from "../../../../../lib/dropbox";

export async function GET(request: Request) {
  const state = crypto.randomUUID();
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", appKey());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), "Set-Cookie": oauthCookie(request, state) },
  });
}


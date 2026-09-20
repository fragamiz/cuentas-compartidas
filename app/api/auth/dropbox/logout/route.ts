import { clearSessionCookie } from "../../../../../lib/dropbox";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  const response = Response.redirect(new URL("/", request.url), 303);
  response.headers.append("set-cookie", clearSessionCookie(request));
  return response;
}

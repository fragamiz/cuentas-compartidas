import { accessToken, downloadState, uploadState } from "../../../lib/dropbox";
import { EMPTY_STATE, type AppState } from "../../../lib/expense-types";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  try {
    const token = await accessToken(request);
    if (!token) return Response.json({ error: "Conecta tu cuenta de Dropbox." }, { status: 401, headers: noStore });
    const response = await downloadState(token);
    if (response.status === 409) {
      const failure = await response.json() as { error?: { ".tag"?: string; path?: { ".tag"?: string } } };
      if (failure.error?.[".tag"] === "path" && failure.error.path?.[".tag"] === "not_found") {
        return Response.json({ state: EMPTY_STATE, version: "" }, { headers: noStore });
      }
      throw new Error("Dropbox no pudo abrir el archivo de datos.");
    }
    if (!response.ok) throw new Error(`Dropbox download: ${response.status}`);
    const metadata = JSON.parse(response.headers.get("dropbox-api-result") ?? "{}") as { rev?: string };
    const state = await response.json() as AppState;
    if (!Array.isArray(state.events)) throw new Error("Archivo de datos inválido.");
    return Response.json({ state, version: metadata.rev ?? "" }, { headers: noStore });
  } catch (error) {
    console.error("state.get", error);
    return Response.json({ error: "No se pudieron cargar los datos de Dropbox." }, { status: 502, headers: noStore });
  }
}

export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origen no permitido." }, { status: 403, headers: noStore });
  try {
    const token = await accessToken(request);
    if (!token) return Response.json({ error: "Conecta tu cuenta de Dropbox." }, { status: 401, headers: noStore });
    const raw = await request.text();
    if (raw.length > 8_000_000) return Response.json({ error: "Los datos superan el límite permitido." }, { status: 413, headers: noStore });
    const body = JSON.parse(raw) as { state?: AppState; version?: string };
    if (!body.state || !Array.isArray(body.state.events) || typeof body.version !== "string") return Response.json({ error: "Los datos no son válidos." }, { status: 400, headers: noStore });
    const response = await uploadState(token, JSON.stringify(body.state), body.version);
    if (response.status === 409) return Response.json({ error: "Estos datos se han modificado en otro dispositivo.", conflict: true }, { status: 409, headers: noStore });
    if (!response.ok) throw new Error(`Dropbox upload: ${response.status}`);
    const metadata = await response.json() as { rev: string };
    return Response.json({ version: metadata.rev, savedAt: new Date().toISOString() }, { headers: noStore });
  } catch (error) {
    console.error("state.put", error);
    return Response.json({ error: "No se pudieron guardar los cambios en Dropbox." }, { status: 502, headers: noStore });
  }
}

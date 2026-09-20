import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { userStates } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { EMPTY_STATE, type AppState } from "../../../lib/expense-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Debes iniciar sesión." }, { status: 401 });
  try {
    const [row] = await getDb().select().from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
    if (!row) return Response.json({ state: EMPTY_STATE, version: 0 });
    return Response.json({ state: JSON.parse(row.data) as AppState, version: row.version });
  } catch (error) {
    console.error("state.get", error);
    return Response.json({ error: "No se pudieron cargar los datos." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Debes iniciar sesión." }, { status: 401 });
  try {
    const body = (await request.json()) as { state?: AppState; version?: number };
    if (!body.state || !Array.isArray(body.state.events) || typeof body.version !== "number") return Response.json({ error: "Los datos no son válidos." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select({ version: userStates.version }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
    const currentVersion = existing?.version ?? 0;
    if (body.version !== currentVersion) return Response.json({ error: "Estos datos se han modificado en otro dispositivo.", conflict: true }, { status: 409 });
    const nextVersion = currentVersion + 1;
    const data = JSON.stringify(body.state);
    if (existing) await db.update(userStates).set({ data, version: nextVersion, updatedAt: new Date().toISOString() }).where(eq(userStates.userId, user.userId));
    else await db.insert(userStates).values({ userId: user.userId, data, version: nextVersion, updatedAt: new Date().toISOString() });
    return Response.json({ version: nextVersion, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("state.put", error);
    return Response.json({ error: "No se pudieron guardar los cambios." }, { status: 500 });
  }
}

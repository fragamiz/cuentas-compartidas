import { getChatGPTUser } from "./chatgpt-auth";
import ExpenseApp from "./expense-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <ExpenseApp displayName={user?.fullName ?? user?.email ?? ""} />;
}

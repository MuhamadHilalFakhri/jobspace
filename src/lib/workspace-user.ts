import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/** Authenticated user for protected Server Components. */
export async function getWorkspaceUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

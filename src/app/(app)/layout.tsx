import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboarding.completed) redirect("/onboarding");

  return (
    <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>
  );
}

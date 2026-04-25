import type { ReactNode } from "react";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <DashboardShell
      user={{
        name: session?.user.name,
        image: session?.user.image,
        role: session?.user.role,
      }}
    >
      {children}
    </DashboardShell>
  );
}

import { DealerShell } from "@/features/dealer/DealerShell";
import { getDealerLayoutData } from "@/features/dealer/queries";

export const dynamic = "force-dynamic";

export default async function DealerLayout({ children }: { children: React.ReactNode }) {
  const data = await getDealerLayoutData();

  return <DealerShell dealer={data.dealer}>{children}</DealerShell>;
}

import { ProfileForm } from "@/features/shop/ProfileForm";
import { getProfileData } from "@/features/shop/queries";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const customer = await getProfileData();

  return <ProfileForm initial={{ name: customer.name, phone: customer.phone }} />;
}

import { redirect } from "next/navigation";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  redirect(`/login?mode=signup&invite=${encodeURIComponent(token)}`);
}

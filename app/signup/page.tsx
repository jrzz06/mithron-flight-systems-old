import { redirect } from "next/navigation";

type SignupPageProps = {
  searchParams: Promise<{ invite?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams({ mode: "signup" });
  if (params.invite) {
    query.set("invite", params.invite);
  }
  redirect(`/login?${query.toString()}`);
}

import { redirect } from "next/navigation";

export default function AdminArchivesRedirectPage() {
  redirect("/admin/orders");
}

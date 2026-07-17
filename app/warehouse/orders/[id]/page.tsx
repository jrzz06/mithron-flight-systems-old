import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WarehouseOrderDetailRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/warehouse/fulfillment/${id}`);
}

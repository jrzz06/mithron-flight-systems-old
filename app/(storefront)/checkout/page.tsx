import dynamic from "next/dynamic";
import { Suspense } from "react";
import CheckoutLoading from "./loading";

const CheckoutPageClient = dynamic(
  () => import("./checkout-page-client").then((mod) => mod.CheckoutPageClient),
  { loading: () => <CheckoutLoading /> }
);

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutPageClient />
    </Suspense>
  );
}

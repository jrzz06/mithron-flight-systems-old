import { Suspense } from "react";
import { CheckoutSuccessClient } from "./checkout-success-client";
import CheckoutLoading from "../loading";

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutSuccessClient />
    </Suspense>
  );
}

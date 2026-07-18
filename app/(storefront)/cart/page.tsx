import dynamic from "next/dynamic";
import { Suspense } from "react";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";
import CartLoading from "./loading";

const CartPageClient = dynamic(
  () => import("./cart-page-client").then((mod) => mod.CartPageClient),
  { loading: () => <CartLoading /> }
);

export default function CartPage() {
  return (
    <SoftErrorBoundary label="Cart">
      <Suspense fallback={<CartLoading />}>
        <CartPageClient />
      </Suspense>
    </SoftErrorBoundary>
  );
}

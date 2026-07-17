import dynamic from "next/dynamic";
import { Suspense } from "react";
import CartLoading from "./loading";

const CartPageClient = dynamic(
  () => import("./cart-page-client").then((mod) => mod.CartPageClient),
  { loading: () => <CartLoading /> }
);

export default function CartPage() {
  return (
    <Suspense fallback={<CartLoading />}>
      <CartPageClient />
    </Suspense>
  );
}

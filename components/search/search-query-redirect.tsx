"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SearchQueryRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.get("q")?.trim() ?? "";
    if (!query) return;
    router.replace(`/products?q=${encodeURIComponent(query)}`);
  }, [router, searchParams]);

  return null;
}

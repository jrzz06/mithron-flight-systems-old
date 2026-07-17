"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { ProductPurchaseExperience } from "@/sections/product/product-purchase-experience";
import type { ProductConfiguratorModel } from "@/sections/product/product-configurator";

type ProductContactDefaultsProps = {
  product: ProductConfiguratorModel;
  summary: {
    name: string;
    price: number;
    compareAt?: number;
  };
};

type ContactDefaults = {
  email: string;
  phone: string;
  region: string;
  isGuest: boolean;
};

const GUEST_DEFAULTS: ContactDefaults = {
  email: "",
  phone: "",
  region: "India",
  isGuest: true
};

export function ProductContactDefaults({ product, summary }: ProductContactDefaultsProps) {
  const [contactDefaults, setContactDefaults] = useState<ContactDefaults>(GUEST_DEFAULTS);

  useEffect(() => {
    let active = true;

    async function hydrateContactDefaults() {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getClaims();
      const userEmail = typeof authData?.claims?.email === "string" ? authData.claims.email : "";
      const userId = typeof authData?.claims?.sub === "string" ? authData.claims.sub : null;

      if (!userId) {
        if (active) setContactDefaults(GUEST_DEFAULTS);
        return;
      }

      let profilePhone = "";
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", userId)
        .maybeSingle();
      profilePhone = typeof profile?.phone === "string" ? profile.phone.trim() : "";

      if (active) {
        setContactDefaults({
          email: userEmail,
          phone: profilePhone,
          region: "India",
          isGuest: false
        });
      }
    }

    void hydrateContactDefaults();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ProductPurchaseExperience
      product={product}
      summary={summary}
      contactDefaults={contactDefaults}
    />
  );
}

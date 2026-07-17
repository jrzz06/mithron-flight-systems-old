import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { listCustomerAddresses } from "@/services/customer-address-actions";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`account-addresses:${userId}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const addresses = await listCustomerAddresses(supabase);
  return NextResponse.json({ addresses });
}

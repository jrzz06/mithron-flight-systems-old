import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { lookupOrderForTracking } from "@/services/customer-orders";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`order-track:${ip}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const requestUrl = new URL(request.url);
  const orderNumber = requestUrl.searchParams.get("orderNumber")?.trim() ?? "";
  const email = requestUrl.searchParams.get("email")?.trim() ?? "";

  if (!orderNumber || !email) {
    return NextResponse.json({ error: "orderNumber and email are required." }, { status: 400 });
  }

  const result = await lookupOrderForTracking(orderNumber, email);
  if (!result) {
    return NextResponse.json({ error: "Order not found. Check your order number and email." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    order: result.order,
    items: result.items
  });
}

import type { ServiceResult } from "@/lib/service-result";
import { serviceUnavailable } from "@/lib/service-result";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { resolveOrderAddresses } from "@/lib/addresses/resolve-server";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

export async function listCustomerOrders(
  userId: string,
  env: EnvSource = process.env
): Promise<ServiceResult<JsonRecord[]>> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?select=id,order_number,status,payment_status,fulfillment_status,total,currency,created_at,updated_at,order_items(count)&created_by_user_id=eq.${userId}&order=created_at.desc&limit=50`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return serviceUnavailable(response.status);
  return { ok: true, data: (await response.json()) as JsonRecord[] };
}

export async function getCustomerOrder(userId: string, orderId: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?select=id,order_number,customer_email,status,payment_status,fulfillment_status,total,currency,metadata,timeline,shipment_tracking,invoice_url,shipping_address_id,billing_address_id,created_by_user_id,created_at,updated_at&id=eq.${encodeURIComponent(orderId)}&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return null;

  const rows = (await response.json()) as JsonRecord[];
  const order = rows[0];
  if (!order || String(order.created_by_user_id ?? "") !== userId) return null;

  const [itemsResponse, paymentsResponse] = await Promise.all([
    fetchWithTimeout(
      `${config.url}/rest/v1/order_items?select=id,order_id,product_slug,product_name,quantity,line_total,metadata&order_id=eq.${encodeURIComponent(orderId)}&limit=50`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    ),
    fetchWithTimeout(
      `${config.url}/rest/v1/payments?select=id,order_id,provider,provider_intent_id,provider_payment_id,amount,currency,status,verified_at,created_at&order_id=eq.${encodeURIComponent(orderId)}&limit=10`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    )
  ]);

  const items = itemsResponse.ok ? ((await itemsResponse.json()) as JsonRecord[]) : [];
  const payments = paymentsResponse.ok ? ((await paymentsResponse.json()) as JsonRecord[]) : [];

  const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
    ? order.metadata as JsonRecord
    : {};
  const addresses = await resolveOrderAddresses(metadata, userId, env, order);
  const payment = payments.find((row) => String(row.status ?? "") === "succeeded") ?? payments[0] ?? null;

  return {
    order,
    items,
    payment,
    shippingAddress: addresses.shippingAddress,
    billingAddress: addresses.billingAddress,
    billingSameAsShipping: addresses.billingSameAsShipping
  };
}

export async function linkGuestOrdersToUser(userId: string, email: string, env: EnvSource = process.env) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!userId || !normalizedEmail) return { linked: 0 };

  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?created_by_user_id=is.null&customer_email=eq.${encodeURIComponent(normalizedEmail)}`,
    {
      method: "PATCH",
      headers: {
        ...headers(config.serviceRoleKey),
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        created_by_user_id: userId,
        updated_at: new Date().toISOString()
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to link guest orders: ${response.status}${text ? ` - ${text.slice(0, 200)}` : ""}`);
  }

  const rows = (await response.json()) as JsonRecord[];
  return { linked: rows.length };
}

export async function fetchCheckoutOrderStatus(
  orderId: string,
  scope: { userId: string } | { guestEmail: string },
  env: EnvSource = process.env
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?select=id,order_number,total,status,payment_status,customer_email,created_by_user_id&id=eq.${encodeURIComponent(orderId)}&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return null;

  const rows = (await response.json()) as JsonRecord[];
  const order = rows[0];
  if (!order?.id) return null;

  if ("userId" in scope) {
    if (String(order.created_by_user_id ?? "") !== scope.userId) return null;
  } else {
    const orderEmail = String(order.customer_email ?? "").trim().toLowerCase();
    if (!orderEmail || orderEmail !== scope.guestEmail.trim().toLowerCase()) return null;
    if (order.created_by_user_id) return null;
  }

  const paymentsResponse = await fetchWithTimeout(
    `${config.url}/rest/v1/payments?select=status,verified_at&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc&limit=5`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  const payments = paymentsResponse.ok ? ((await paymentsResponse.json()) as JsonRecord[]) : [];
  const payment = payments.find((row) => String(row.status ?? "") === "succeeded") ?? payments[0] ?? null;

  return {
    orderId: String(order.id),
    orderNumber: String(order.order_number ?? order.id),
    total: Number(order.total ?? 0),
    status: String(order.status ?? ""),
    paymentStatus: String(payment?.status ?? order.payment_status ?? ""),
    orderPaymentStatus: String(order.payment_status ?? "")
  };
}

export async function lookupOrderForTracking(
  orderNumber: string,
  email: string,
  env: EnvSource = process.env
) {
  const normalizedNumber = orderNumber.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedNumber || !normalizedEmail) return null;

  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?select=id,order_number,status,payment_status,fulfillment_status,channel,shipment_tracking,timeline,total,metadata&order_number=eq.${encodeURIComponent(normalizedNumber)}&customer_email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return null;

  const rows = (await response.json()) as JsonRecord[];
  const order = rows[0];
  if (!order?.id) return null;

  const orderId = String(order.id);
  const itemsResponse = await fetchWithTimeout(
    `${config.url}/rest/v1/order_items?select=product_slug,product_name,quantity,line_total&order_id=eq.${encodeURIComponent(orderId)}&limit=50`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  const items = itemsResponse.ok ? ((await itemsResponse.json()) as JsonRecord[]) : [];

  // Return only fields the track-order UI renders — omit email and internal timestamps.
  return {
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      payment_status: order.payment_status,
      fulfillment_status: order.fulfillment_status,
      channel: order.channel,
      shipment_tracking: order.shipment_tracking,
      timeline: order.timeline,
      total: order.total,
      metadata: order.metadata
    },
    items
  };
}

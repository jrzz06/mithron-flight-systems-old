import { NextResponse } from "next/server";

/** Operational cold-storage archive removed in the leads/fulfilment rebuild. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    disabled: true,
    message: "Operational data archive has been removed. Orders use hard delete only."
  });
}

export async function POST() {
  return GET();
}

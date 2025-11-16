"use server";

import { NextResponse } from "next/server";

const DEFAULT_PROXY_URL = "http://localhost:8787";

export async function GET() {
  const baseUrl = process.env.XX_PROXY_BASE_URL ?? DEFAULT_PROXY_URL;
  try {
    const response = await fetch(`${baseUrl}/api/messages`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message =
        data?.error ?? `xx proxy responded with ${response.status}`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach xx proxy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

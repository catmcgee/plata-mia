"use server";

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PROXY_URL = "http://localhost:8787";

export async function POST(request: NextRequest) {
  const baseUrl = process.env.XX_PROXY_BASE_URL ?? DEFAULT_PROXY_URL;

  try {
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const text = body.text ?? "Hello from Plata Mia 👋";

    const response = await fetch(`${baseUrl}/api/send-self`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data?.error ?? `xx proxy responded with ${response.status}`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const payload = await response.json().catch(() => ({ ok: true }));
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach xx proxy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



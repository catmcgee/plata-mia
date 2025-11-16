"use server";

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PROXY_URL = "http://localhost:8787";

export async function forwardNotification(request: NextRequest, targetPath: string) {
  const baseUrl = process.env.XX_PROXY_BASE_URL ?? DEFAULT_PROXY_URL;

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    // Ignore body parsing errors and treat as empty payload.
  }

  try {
    const response = await fetch(`${baseUrl}${targetPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data?.error ?? `xx proxy responded with ${response.status}`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const data = await response.json().catch(() => ({ ok: true }));
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach xx proxy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



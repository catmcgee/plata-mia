"use server";

import { NextRequest } from "next/server";

import { forwardNotification } from "../_proxy";

export async function POST(request: NextRequest) {
  return forwardNotification(request, "/notify/stealth-payment");
}



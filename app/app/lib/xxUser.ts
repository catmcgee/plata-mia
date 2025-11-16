"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";

import { StealthProfile } from "../types";

export function useXxUserId(profile?: StealthProfile | null) {
  const { address } = useAccount();

  return useMemo(() => {
    const profileId = profile?.xxIdentity?.trim();
    if (profileId) {
      return profileId;
    }

    if (address) {
      return `wallet:${address.toLowerCase()}`;
    }

    return null;
  }, [profile?.xxIdentity, address]);
}



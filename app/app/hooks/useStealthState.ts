'use client';

import { startTransition, useCallback, useEffect, useState } from "react";
import { AssetId, StealthPayment, StealthProfile } from "../types";

const PROFILE_STORAGE_KEY = "xcm-stealth-profile";
const PAYMENTS_STORAGE_KEY = "xcm-stealth-payments";

const defaultProfile: StealthProfile = {
  stealthPublicId: "",
  xxIdentity: "",
};

const defaultPayments: StealthPayment[] = [];

const readFromStorage = <T,>(key: string): T | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn(`Failed to parse localStorage key "${key}"`, error);
    return null;
  }
};

const writeToStorage = (key: string, value: unknown) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to write localStorage key "${key}"`, error);
  }
};

type RecordPaymentInput = {
  stealthId: string;
  stealthIdHex: `0x${string}`;
  assetId: AssetId;
  amount: number;
  direction?: "incoming" | "outgoing";
  txHash?: `0x${string}`;
};

export const useStealthState = () => {
  const [profile, setProfile] = useState<StealthProfile>(defaultProfile);
  const [payments, setPayments] = useState<StealthPayment[]>(defaultPayments);

  useEffect(() => {
    startTransition(() => {
      const storedProfile = readFromStorage<StealthProfile>(PROFILE_STORAGE_KEY);
      if (storedProfile) {
        setProfile(storedProfile);
      }

      const storedPayments = readFromStorage<StealthPayment[]>(PAYMENTS_STORAGE_KEY);
      if (storedPayments) {
        setPayments(storedPayments);
      }
    });
  }, []);

  const updateProfile = useCallback(
    (next: StealthProfile) => {
      setProfile(next);
      writeToStorage(PROFILE_STORAGE_KEY, next);
    },
    []
  );

  const recordStealthPayment = useCallback(
    ({ stealthId, stealthIdHex, assetId, amount, direction, txHash }: RecordPaymentInput) => {
      const newPayment: StealthPayment = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `payment-${Date.now()}`,
        stealthId,
        stealthIdHex,
        assetId,
        amount,
        direction: direction ?? "incoming",
        status: "unread",
        createdAt: new Date().toISOString(),
        txHash,
      };

      setPayments((prev) => {
        const nextPayments = [newPayment, ...prev];
        writeToStorage(PAYMENTS_STORAGE_KEY, nextPayments);
        return nextPayments;
      });
    },
    []
  );

  const markPaymentWithdrawn = useCallback((id: string) => {
    setPayments((prev) => {
      const nextPayments = prev.map((payment) =>
        payment.id === id && payment.status === "unread"
          ? { ...payment, status: "withdrawn" }
          : payment
      );

      writeToStorage(PAYMENTS_STORAGE_KEY, nextPayments);
      return nextPayments;
    });
  }, []);

  const state = {
    profile,
    payments,
    updateProfile,
    sendStealthPayment: recordStealthPayment,
    withdrawPayment: markPaymentWithdrawn,
  };
  return state;
};

export default useStealthState;


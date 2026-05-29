"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Unit } from "./types";

/**
 * Denomination context. The whole dashboard reads its current unit from
 * here so every formatter call site stays in sync. The toggle lives in
 * the TopBar; the rest of the app just consumes.
 *
 * The current BTC price is part of the context because converting USD →
 * sats requires a divisor, and the divisor changes whenever the live
 * price refreshes. Putting it here means formatters don't need a fourth
 * argument bolted onto every call.
 */
interface UnitContextValue {
  unit: Unit;
  setUnit: (next: Unit) => void;
  /** Live BTC price in USD, used to convert USD-denominated values into sats. */
  price: number;
}

const UnitContext = createContext<UnitContextValue | null>(null);

const STORAGE_KEY = "sats-stacker:unit";

function loadUnit(): Unit {
  if (typeof window === "undefined") return "usd";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "sats" ? "sats" : "usd";
  } catch {
    return "usd";
  }
}

function saveUnit(unit: Unit) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    /* localStorage blocked — silently fall back to in-memory state */
  }
}

export function UnitProvider({
  price,
  children,
}: {
  price: number;
  children: ReactNode;
}) {
  // Lazy-init from localStorage so the user's preference survives reloads
  // without a flash. Default is USD when storage is unavailable.
  const [unit, setUnitState] = useState<Unit>(() => loadUnit());

  const value = useMemo<UnitContextValue>(
    () => ({
      unit,
      setUnit: (next: Unit) => {
        setUnitState(next);
        saveUnit(next);
      },
      price,
    }),
    [unit, price],
  );

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

/**
 * Read the current denomination + live price. Safe to call from any
 * client component below `UnitProvider`. Outside the provider, returns
 * the safe USD default so a stray render doesn't crash.
 */
export function useUnit(): UnitContextValue {
  const ctx = useContext(UnitContext);
  if (ctx) return ctx;
  return { unit: "usd", setUnit: () => undefined, price: 0 };
}

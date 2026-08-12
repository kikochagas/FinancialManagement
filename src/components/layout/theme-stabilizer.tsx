"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/lib/store";

export function ThemeStabilizer() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);

  useEffect(() => {
    // Re-trigger theme application on mount to sync with persisted state
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}

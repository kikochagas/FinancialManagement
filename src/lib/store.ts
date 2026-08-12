import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  theme: "Dark" | "Light" | "System";
  currency: string;
  language: string;
  setTheme: (theme: "Dark" | "Light" | "System") => void;
  setCurrency: (currency: string) => void;
  setLanguage: (language: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "Dark",
      currency: "EUR",
      language: "English",
      setTheme: (theme) => {
        set({ theme });
        // Update DOM class list for dark/light mode
        if (typeof window !== "undefined") {
          const root = window.document.documentElement;
          root.classList.remove("light", "dark");
          if (theme === "System") {
            const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
            root.classList.add(systemTheme);
          } else {
            root.classList.add(theme.toLowerCase());
          }
        }
      },
      setCurrency: (currency) => set({ currency }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: "financial-management-settings",
    }
  )
);

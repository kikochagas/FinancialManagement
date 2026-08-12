"use client";

import React, { useTransition, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { updateSettings, resetAndSeedDatabase, wipeUserData } from "./actions";
import { useSettingsStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Settings, RefreshCw, Languages, Coins, Palette, AlertTriangle, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";

interface SettingsClientProps {
  data: {
    settings: {
      theme: string;
      currency: string;
      language: string;
    };
  };
}

export function SettingsClient({ data }: SettingsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [isResetPending, startResetTransition] = useTransition();
  const [isWipePending, startWipeTransition] = useTransition();
  const [message, setMessage] = useState("");
  const { setTheme: setNextTheme } = useTheme();

  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const currency = useSettingsStore((state) => state.currency);
  const setCurrency = useSettingsStore((state) => state.setCurrency);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  // Sync database settings with Zustand store on load
  useEffect(() => {
    if (data.settings.theme) {
      setTheme(data.settings.theme as any);
      setNextTheme(data.settings.theme.toLowerCase());
    }
    if (data.settings.currency) {
      setCurrency(data.settings.currency);
    }
    if (data.settings.language) {
      setLanguage(data.settings.language);
    }
  }, [data.settings, setTheme, setCurrency, setLanguage, setNextTheme]);

  const handleSavePreferences = (newTheme: "Dark" | "Light" | "System") => {
    setTheme(newTheme);
    setNextTheme(newTheme.toLowerCase());
    startTransition(async () => {
      const res = await updateSettings({
        theme: newTheme,
        currency,
        language,
      });
      if (res?.data?.success) {
        setMessage("Preferences saved successfully!");
        setTimeout(() => setMessage(""), 3000);
      }
    });
  };

  const handleResetDatabase = () => {
    if (
      confirm(
        "WARNING: This will wipe out all custom modifications in the database and re-seed with the initial benchmark balances and configuration! Continue?"
      )
    ) {
      startResetTransition(async () => {
        const res = await resetAndSeedDatabase();
        if (res?.data?.success) {
          setMessage("Database reset & re-seeded successfully!");
          setTimeout(() => setMessage(""), 5000);
        }
      });
    }
  };

  const handleWipeData = () => {
    if (
      confirm(
        "WARNING: This will permanently delete ALL your financial data (accounts, transactions, goals, investments, etc.). Your settings and account will remain. This action cannot be undone. Continue?"
      )
    ) {
      startWipeTransition(async () => {
        const res = await wipeUserData();
        if (res?.data?.success) {
          setMessage("All financial data wiped successfully!");
          setTimeout(() => setMessage(""), 5000);
        }
      });
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Preferences Card */}
      <Card className="border-border bg-card/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-card-foreground flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> Interface Theme
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Adjust interface display aesthetics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Select Theme</span>
            <div className="w-[180px]">
              <Select value={theme} onValueChange={(val: any) => handleSavePreferences(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dark">Dark Mode</SelectItem>
                  <SelectItem value="Light">Light Mode</SelectItem>
                  <SelectItem value="System">System Default</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Localization and Currency Card */}
      <Card className="border-border bg-card/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-card-foreground flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" /> Currency & Localization
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">System denomination and language settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Default Currency</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">Fixed for June/July accounts</span>
            </div>
            <div className="w-[180px]">
              <Select value={currency} onValueChange={() => {}} disabled>
                <SelectTrigger>
                  <SelectValue placeholder="EUR" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">Euro (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Language Support</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">Localization support is coming soon</span>
            </div>
            <div className="w-[180px]">
              <Select value={language} onValueChange={() => {}} disabled>
                <SelectTrigger>
                  <SelectValue placeholder="English" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Admin Operations */}
      <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> System Maintenance
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Danger zone: destructive database operations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs text-card-foreground font-semibold">Reset & Re-seed Database</span>
              <p className="text-[10px] text-muted-foreground max-w-sm">
                Wipe all tables and re-populate millisecond-fresh seed configurations representing the initial benchmark cash flows.
              </p>
            </div>
            <Button variant="outline" size="sm" className="flex items-center gap-2 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleResetDatabase} disabled={isResetPending || isWipePending}>
              <RefreshCw className={cn("h-4 w-4", isResetPending && "animate-spin")} />
              {isResetPending ? "Seeding..." : "Reset Data"}
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-border/50 pt-4">
            <div className="space-y-1">
              <span className="text-xs text-card-foreground font-semibold">Wipe All Financial Data</span>
              <p className="text-[10px] text-muted-foreground max-w-sm">
                Permanently delete all accounts, transactions, investments, and goals. You will start fresh with zero balances.
              </p>
            </div>
            <Button variant="destructive" size="sm" className="flex items-center gap-2" onClick={handleWipeData} disabled={isWipePending || isResetPending}>
              <Trash2 className={cn("h-4 w-4", isWipePending && "animate-spin")} />
              {isWipePending ? "Wiping..." : "Wipe All Data"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Toast Alert */}
      {message && (
        <div className="fixed bottom-6 right-6 z-50 py-3 px-5 rounded-lg bg-popover border border-primary/30 text-primary text-xs font-semibold shadow-glow animate-in slide-in-from-bottom-5">
          {message}
        </div>
      )}
    </div>
  );
}

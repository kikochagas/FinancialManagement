"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { linkAccounts, syncBankAccount } from "../actions";
import { LinkAction, TLinkAction } from "@/lib/constants";

interface SafePendingAccount {
  id: string;
  displayName: string;
  maskedIdentifier: string | null;
  currency: string;
  cashAccountType: string | null;
  isAlreadyLinked: boolean;
  linkedAccountName: string | null;
}

interface ExistingAccount {
  id: string;
  name: string;
  currency: string;
  type: string;
}

interface LinkAccountsClientProps {
  connectionId: string;
  institutionName: string;
  pendingAccounts: SafePendingAccount[];
  existingAccounts: ExistingAccount[];
}

interface AccountSelectionState {
  action: TLinkAction;
  name: string; // Used if CREATE
  existingAccountId: string; // Used if LINK
  importHistory: boolean;
}

export function LinkAccountsClient({ connectionId, institutionName, pendingAccounts, existingAccounts }: LinkAccountsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize state for each pending account
  const [selections, setSelections] = useState<Record<string, AccountSelectionState>>(() => {
    const initialState: Record<string, AccountSelectionState> = {};
    pendingAccounts.forEach(acc => {
      initialState[acc.id] = {
        action: acc.isAlreadyLinked ? LinkAction.IGNORE : LinkAction.CREATE,
        name: acc.displayName,
        existingAccountId: "",
        importHistory: false, // Default: OFF
      };
    });
    return initialState;
  });

  const handleSelectionChange = (pendingId: string, field: keyof AccountSelectionState, value: any) => {
    setSelections(prev => ({
      ...prev,
      [pendingId]: {
        ...prev[pendingId],
        [field]: value
      }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const payload = pendingAccounts.map(acc => {
          const state = selections[acc.id];
          return {
            pendingAccountId: acc.id,
            action: state.action,
            name: state.name,
            existingAccountId: state.existingAccountId,
            importHistory: state.importHistory
          };
        });

        const res = await linkAccounts({ connectionId, selections: payload as any });
        
        if (res?.data?.success) {
          const linkedIds = res.data.linkedAccountIds || [];
          if (linkedIds.length > 0) {
            setIsSyncing(true);
            let anySuccess = false;
            let anyPartial = false;
            let anyReauth = false;
            let anyError = false;

            for (const accId of linkedIds) {
              const syncRes = await syncBankAccount({ accountId: accId });
              if (syncRes?.data) {
                const data = syncRes.data;
                if ("reauthRequired" in data && data.reauthRequired) {
                  anyReauth = true;
                } else if ("success" in data && data.success) {
                  anySuccess = true;
                } else if ("partial" in data && data.partial) {
                  anyPartial = true;
                } else {
                  anyError = true;
                }
              } else {
                anyError = true;
              }
            }
            
            if (anyReauth) {
              alert("Bank account connected, but authorization must be renewed before it can be synchronized.");
            } else if (anyError && !anySuccess && !anyPartial) {
              alert("Bank account connected, but the initial synchronization failed. You can retry from Accounts.");
            } else if (anyPartial || (anyError && anySuccess)) {
              alert("Bank account connected, but some data could not be synchronized.");
            } else {
              alert("Bank account connected and synchronized.");
            }
          }
          router.push("/accounts");
        } else if (res?.serverError) {
          setError(res.serverError);
        } else {
          setError("Failed to link accounts");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred");
      }
    });
  };

  const accAlreadyLinked = (id: string) => pendingAccounts.find(a => a.id === id)?.isAlreadyLinked;

  const allAccountsLinked = pendingAccounts.length > 0 && pendingAccounts.every(a => a.isAlreadyLinked);

  if (allAccountsLinked) {
    return (
      <Card className="border-border max-w-lg mx-auto mt-12 text-center">
        <CardHeader>
          <div className="mx-auto h-12 w-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <CardTitle>Bank Reconnected</CardTitle>
          <CardDescription>
            Your connection to {institutionName} was successfully restored. All your accounts are already linked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push("/accounts")} className="w-full">
            Return to Accounts
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm font-semibold p-4 rounded-md border border-destructive/20">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {pendingAccounts.map((acc) => {
          const state = selections[acc.id];
          const isSelected = state.action !== LinkAction.IGNORE;
          
          return (
            <Card key={acc.id} className={`border-border transition-colors ${isSelected ? 'bg-card' : 'bg-muted/30 opacity-75'}`}>
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{acc.displayName}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {acc.maskedIdentifier || "No account number"} • {acc.currency}
                    </CardDescription>
                  </div>
                  
                  {acc.isAlreadyLinked ? (
                    <div className="text-sm font-semibold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full">
                      Already linked: {acc.linkedAccountName}
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id={`connect-${acc.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked: boolean) => handleSelectionChange(acc.id, "action", checked ? LinkAction.CREATE : LinkAction.IGNORE)}
                      />
                      <Label htmlFor={`connect-${acc.id}`} className="text-sm font-medium cursor-pointer">
                        Connect this account
                      </Label>
                    </div>
                  )}
                </div>
              </CardHeader>

              {isSelected && !acc.isAlreadyLinked && (
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Create New Option */}
                    <div className={`p-4 rounded-lg border ${state.action === LinkAction.CREATE ? 'border-primary bg-primary/5' : 'border-border bg-background'} flex gap-3 cursor-pointer`}
                         onClick={() => handleSelectionChange(acc.id, "action", LinkAction.CREATE)}>
                      <div className="pt-0.5">
                        <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${state.action === LinkAction.CREATE ? 'border-primary' : 'border-input'}`}>
                          {state.action === LinkAction.CREATE && <div className="h-2 w-2 rounded-full bg-primary" />}
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label className="font-semibold text-sm cursor-pointer block">Create new account</Label>
                        <Input 
                          value={state.name}
                          onChange={(e) => handleSelectionChange(acc.id, "name", e.target.value)}
                          placeholder="Account Name"
                          disabled={state.action !== LinkAction.CREATE}
                          className="h-8 text-sm bg-background"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    {/* Link Existing Option */}
                    <div className={`p-4 rounded-lg border ${state.action === LinkAction.LINK ? 'border-primary bg-primary/5' : 'border-border bg-background'} flex gap-3 cursor-pointer`}
                         onClick={() => handleSelectionChange(acc.id, "action", LinkAction.LINK)}>
                      <div className="pt-0.5">
                        <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${state.action === LinkAction.LINK ? 'border-primary' : 'border-input'}`}>
                          {state.action === LinkAction.LINK && <div className="h-2 w-2 rounded-full bg-primary" />}
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label className="font-semibold text-sm cursor-pointer block">Link existing account</Label>
                        <Select 
                          disabled={state.action !== LinkAction.LINK}
                          value={state.existingAccountId}
                          onValueChange={(val) => handleSelectionChange(acc.id, "existingAccountId", val)}
                        >
                          <SelectTrigger className="h-8 text-sm bg-background" onClick={(e) => e.stopPropagation()}>
                            <SelectValue placeholder="Select account..." />
                          </SelectTrigger>
                          <SelectContent>
                            {existingAccounts
                              .filter(ea => ea.currency === acc.currency) // Enforce currency match
                              .map(ea => (
                              <SelectItem key={ea.id} value={ea.id}>
                                {ea.name} ({ea.type})
                              </SelectItem>
                            ))}
                            {existingAccounts.filter(ea => ea.currency === acc.currency).length === 0 && (
                              <SelectItem value="none" disabled>No compatible EUR accounts</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  
                  {/* Sync Settings */}
                  <div className="pt-2">
                    <div className="flex flex-row items-start space-x-2 bg-muted/20 p-3 rounded-md">
                      <Checkbox 
                        id={`history-${acc.id}`} 
                        checked={state.importHistory}
                        onCheckedChange={(c: boolean) => handleSelectionChange(acc.id, "importHistory", !!c)}
                        disabled={state.action === LinkAction.CREATE}
                      />
                      <div className="space-y-1 leading-none">
                        <Label htmlFor={`history-${acc.id}`} className="text-[12px] font-medium leading-none cursor-pointer">
                          Import available historical bank transactions
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          {state.action === LinkAction.CREATE 
                            ? "New accounts will automatically fetch all available history." 
                            : "If checked, all available past transactions will be imported. Otherwise, only new transactions from today onwards will be synced to prevent duplicates."}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isPending || isSyncing} className="px-8">
          {isSyncing ? "Syncing initial data..." : isPending ? "Processing..." : "Connect Selected Accounts"}
        </Button>
      </div>
    </form>
  );
}

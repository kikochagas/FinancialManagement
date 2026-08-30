"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Landmark, CreditCard, Wallet, Coins, Plus, Building, MoreVertical, Link2, RefreshCw, Unlink, Trash2, ShieldCheck, HelpCircle, Edit2, ArrowRightLeft } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { AccountType } from "@/lib/constants";
import { createAccount, updateAccount, deleteAccount, syncBankAccount, disconnectBank } from "./actions";

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  investmentEventsCount?: number;
  recentTransactions: Array<{
    id: string;
    date: string;
    description: string;
    direction: string;
    amount: number;
    category: string;
    color: string;
    accountId?: string;
    destinationAccountId?: string;
  }>;
  isBankConnected: boolean;
  hasBankHistory: boolean;
  institutionName?: string | null;
  connectionStatus?: string | null;
  validUntil?: string | null;
  lastBalanceSyncedAt?: string | null;
  lastTransactionSyncedAt?: string | null;
}

interface AccountsClientProps {
  data: {
    accounts: Account[];
  };
}

export function AccountsClient({ data }: AccountsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isAddOptionsOpen, setIsAddOptionsOpen] = useState(false);
  const [isAddManualOpen, setIsAddManualOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // New Account state
  const [newAcc, setNewAcc] = useState({
    name: "",
    type: "Bank",
    balance: "",
  });

  const [editAcc, setEditAcc] = useState({
    id: "",
    name: "",
    type: "",
    balance: "",
    currency: "",
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createAccount({
        name: newAcc.name,
        type: newAcc.type,
        balance: Number(newAcc.balance) || 0,
      });
      if (res?.data?.success) {
        setIsAddManualOpen(false);
        setNewAcc({ name: "", type: "Bank", balance: "" });
      }
    });
  };

  const handleEditTrigger = (acc: Account) => {
    setSelectedAccount(acc);
    setEditAcc({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      balance: String(acc.balance),
      currency: acc.currency,
    });
    setIsEditOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateAccount({
        id: editAcc.id,
        name: editAcc.name,
        type: editAcc.type,
        balance: Number(editAcc.balance) || 0,
        currency: editAcc.currency,
      });
      if (res?.data?.success) {
        setIsEditOpen(false);
      }
    });
  };

  const handleDeleteTrigger = (id: string) => {
    if (confirm("Are you sure you want to delete this account? This will delete all its transactions.")) {
      startTransition(async () => {
        await deleteAccount({ id });
      });
    }
  };

  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  React.useEffect(() => {
    // Handle URL error parameters
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      if (errorParam === "authorization_failed") {
        setErrorToast("Bank connection was cancelled or could not be authorized.");
      } else if (errorParam === "session_creation_failed") {
        setErrorToast("We could not complete the bank connection. Please try again.");
      } else {
        setErrorToast("An unexpected error occurred during bank connection.");
      }
      // Remove query param
      router.replace("/accounts");
    }
  }, [router]);

  const handleSyncBank = (id: string) => {
    if (syncingAccountId) return;
    setSyncingAccountId(id);
    setSuccessToast(null);
    setErrorToast(null);

    startTransition(async () => {
      try {
        const res = await syncBankAccount({ accountId: id });
        setSyncingAccountId(null);
        if (res?.data && "reauthRequired" in res.data && res.data.reauthRequired) {
          setErrorToast(`Your bank connection needs to be renewed (${(res.data as any).institutionName}).`);
        } else if (res?.serverError) {
          setErrorToast(`Sync failed: ${res.serverError}`);
        } else if (res?.data && "success" in res.data && res.data.success) {
          const imported = (res.data as any).imported || 0;
          if (imported > 0) {
            setSuccessToast(`Bank synced. Balance updated and ${imported} new transactions imported.`);
          } else {
            setSuccessToast("Everything is already up to date.");
          }
        }
      } catch (err) {
        setSyncingAccountId(null);
        setErrorToast("Sync failed.");
      }
    });
  };

  const handleDisconnectTrigger = (acc: Account) => {
    if (confirm(`Disconnect ${acc.institutionName || "bank"}?\n\nAutomatic bank synchronization will stop.\nYour existing account and imported transaction history will be kept.`)) {
      startTransition(async () => {
        const res = await disconnectBank({ accountId: acc.id });
        if (res?.data?.success) {
          setSuccessToast(`Disconnected from ${res.data.institutionName}.`);
        } else if (res?.serverError) {
          setErrorToast(`Failed to disconnect: ${res.serverError}`);
        }
      });
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case AccountType.BANK:
        return Landmark;
      case AccountType.TRADE_REPUBLIC:
        return Wallet;

      case AccountType.BENEFITS:
        return CreditCard;
      case AccountType.CRYPTO_WALLET:
        return Coins;
      default:
        return Wallet;
    }
  };

  const getAccountBadgeColor = (type: string) => {
    switch (type) {
      case AccountType.BANK:
        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      case AccountType.TRADE_REPUBLIC:
        return "bg-violet-500/10 border-violet-500/20 text-violet-400";

      case AccountType.BENEFITS:
        return "bg-pink-500/10 border-pink-500/20 text-pink-400";
      case AccountType.CRYPTO_WALLET:
        return "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";
      default:
        return "bg-neutral-800 border-neutral-700 text-neutral-400";
    }
  };

  return (
    <div className="space-y-6">
      {errorToast && (
        <div className="bg-destructive/10 text-destructive text-sm font-semibold p-4 rounded-md border border-destructive/20 flex justify-between">
          <span>{errorToast}</span>
          <button onClick={() => setErrorToast(null)}>✕</button>
        </div>
      )}
      {successToast && (
        <div className="bg-emerald-500/10 text-emerald-500 text-sm font-semibold p-4 rounded-md border border-emerald-500/20 flex justify-between">
          <span>{successToast}</span>
          <button onClick={() => setSuccessToast(null)}>✕</button>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Create and oversee your financial entities, wallets, and benefits cards.</p>
        </div>

        <Dialog open={isAddOptionsOpen} onOpenChange={setIsAddOptionsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add account
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-background sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Account</DialogTitle>
              <DialogDescription>Choose how you want to add your account.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 py-4">
              <div 
                className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer flex gap-4 items-center transition-colors"
                onClick={() => {
                  setIsAddOptionsOpen(false);
                  setIsAddManualOpen(true);
                }}
              >
                <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                  <Edit2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Create manually</h4>
                  <p className="text-xs text-muted-foreground mt-1">Add cash, broker, investment or other manually managed account.</p>
                </div>
              </div>
              
              <div 
                className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer flex gap-4 items-center transition-colors"
                onClick={() => {
                  window.location.assign("/accounts/connect");
                }}
              >
                <div className="h-10 w-10 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Connect bank</h4>
                  <p className="text-xs text-muted-foreground mt-1">Securely connect a supported Portuguese bank.</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isAddManualOpen} onOpenChange={setIsAddManualOpen}>
          <DialogContent className="border-border bg-background">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Create Financial Account</DialogTitle>
                <DialogDescription>Define a new asset account, bank connection, or crypto wallet.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Account Name</label>
                  <Input
                    type="text"
                    placeholder="e.g. Millennium BCP"
                    value={newAcc.name}
                    onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Account Type</label>
                    <Select value={newAcc.type} onValueChange={(val) => setNewAcc({ ...newAcc, type: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bank">Bank</SelectItem>
                        <SelectItem value="Trade Republic">Trade Republic</SelectItem>
                        <SelectItem value={AccountType.BENEFITS}>Benefits (Meal, Flex, etc.)</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Crypto Wallet">Crypto Wallet</SelectItem>
                        <SelectItem value="Broker">Broker / Investment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Opening Balance (€)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newAcc.balance}
                      onChange={(e) => setNewAcc({ ...newAcc, balance: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" size="sm">Cancel</Button>
                </DialogClose>
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Grid of Accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.accounts.map((acc) => {
          const Icon = getAccountIcon(acc.type);
          return (
            <Card key={acc.id} className="border-border bg-card/50 shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-semibold text-foreground">{acc.name}</CardTitle>
                      {(() => {
                        if (acc.isBankConnected) {
                           const isExpired = acc.validUntil && new Date(acc.validUntil) <= new Date();
                           const needsReconnect = isExpired || acc.connectionStatus === "EXPIRED" || acc.connectionStatus === "REVOKED";
                           
                           if (needsReconnect) {
                             return (
                               <span className="inline-block text-[9px] px-2 py-0.5 rounded-full border bg-destructive/10 border-destructive/20 text-destructive uppercase font-bold">
                                 Reconnect Required
                               </span>
                             );
                           } else {
                             return (
                               <span className="inline-block text-[9px] px-2 py-0.5 rounded-full border bg-emerald-500/10 border-emerald-500/20 text-emerald-500 uppercase font-bold">
                                 Bank Connected
                               </span>
                             );
                           }
                        }
                        if (acc.hasBankHistory) {
                          return (
                            <span className="inline-block text-[9px] px-2 py-0.5 rounded-full border bg-muted text-muted-foreground uppercase font-bold">
                              Disconnected
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className={cn("inline-block text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold", getAccountBadgeColor(acc.type))}>
                        {acc.type}
                      </span>
                      {acc.isBankConnected && acc.institutionName && (
                        <span className="text-[10px] text-muted-foreground">
                          {acc.institutionName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted border border-border text-muted-foreground">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center justify-between">
                      Current Balance
                      {acc.isBankConnected && acc.lastBalanceSyncedAt && (
                        <span className="text-[9px] lowercase font-normal opacity-80">Synced {new Date(acc.lastBalanceSyncedAt).toLocaleDateString()}</span>
                      )}
                    </span>
                    <div className="text-2xl font-extrabold text-foreground tracking-tight mt-0.5">
                      {formatCurrency(acc.balance, acc.currency)}
                    </div>
                  </div>

                  {/* Sub-ledger */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <ArrowRightLeft className="h-3 w-3" /> Recent Transactions
                    </span>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                      {acc.recentTransactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                          <div className="flex flex-col">
                            <span className="font-semibold text-card-foreground truncate max-w-[140px]">{tx.description}</span>
                            <span className="text-[9px] text-muted-foreground mt-0.5 font-mono">{tx.date}</span>
                          </div>
                          {(() => {
                             let sign = "-";
                             let color = "text-foreground";
                             if (tx.direction === "Credit") {
                               sign = "+"; color = "text-emerald-500 dark:text-emerald-400";
                             } else if (tx.direction === "InternalTransfer") {
                               if (tx.destinationAccountId === acc.id) {
                                 sign = "+"; color = "text-emerald-500 dark:text-emerald-400";
                               } else {
                                 sign = "-"; color = "text-foreground";
                               }
                             }
                             return (
                               <span className={cn("font-bold text-[11px]", color)}>
                                 {tx.direction === "InternalTransfer" ? "⇄ " : ""}{sign}{formatCurrency(Math.abs(tx.amount))}
                               </span>
                             );
                          })()}
                        </div>
                      ))}
                      {acc.recentTransactions.length === 0 && (
                        <p className="text-[11px] text-muted-foreground italic py-2">
                          {acc.type === "Broker" ? (
                            (acc.investmentEventsCount ?? 0) > 0 
                              ? `${acc.investmentEventsCount} activities. View in Investments -> Activity.` 
                              : "No transaction history found."
                          ) : (
                            "No transaction history found."
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </div>

              {/* Card Actions */}
              <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-end gap-2 flex-wrap">
                {(() => {
                   if (!acc.isBankConnected) return null;
                   const isExpired = acc.validUntil && new Date(acc.validUntil) <= new Date();
                   const needsReconnect = isExpired || acc.connectionStatus === "EXPIRED" || acc.connectionStatus === "REVOKED";

                   if (needsReconnect) {
                     return (
                       <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => window.location.assign(`/accounts/connect?institution=${encodeURIComponent(acc.institutionName || "")}&reconnectAccountId=${acc.id}`)}>
                         Reconnect bank
                       </Button>
                     );
                   } else {
                     return (
                       <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => handleSyncBank(acc.id)} disabled={syncingAccountId === acc.id}>
                         <RefreshCw className={cn("h-3.5 w-3.5 mr-1", syncingAccountId === acc.id && "animate-spin")} /> Sync bank
                       </Button>

                     );
                   }
                })()}
                
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => handleEditTrigger(acc)}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                
                {(() => {
                  if (!acc.isBankConnected) {
                    return (
                      <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTrigger(acc.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    );
                  }
                  
                  const isExpired = acc.validUntil && new Date(acc.validUntil) <= new Date();
                  const needsReconnect = isExpired || acc.connectionStatus === "EXPIRED" || acc.connectionStatus === "REVOKED";
                  
                  if (!needsReconnect) {
                    return (
                      <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive" onClick={() => handleDisconnectTrigger(acc)} disabled={isPending || syncingAccountId === acc.id}>
                        Disconnect
                      </Button>
                    );
                  }
                  
                  return null;
                })()}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="border-border bg-background">
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>Edit Account details</DialogTitle>
              <DialogDescription>Modify parameters for {selectedAccount?.name}.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {selectedAccount?.isBankConnected && (
                <div className="bg-muted/50 p-3 rounded-md text-sm text-muted-foreground border border-border flex items-start gap-2">
                  <Landmark className="h-4 w-4 mt-0.5 text-emerald-500" />
                  <div>
                    <span className="font-semibold text-foreground block">Balance is synchronized from your bank.</span>
                    Type, currency, and balance cannot be manually changed.
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">Account Name</label>
                <Input
                  type="text"
                  value={editAcc.name}
                  onChange={(e) => setEditAcc({ ...editAcc, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Account Type</label>
                  <Select value={editAcc.type} onValueChange={(val) => setEditAcc({ ...editAcc, type: val })} disabled={selectedAccount?.isBankConnected}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="Trade Republic">Trade Republic</SelectItem>
                      <SelectItem value={AccountType.BENEFITS}>Benefits (Meal, Flex, etc.)</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Crypto Wallet">Crypto Wallet</SelectItem>
                      <SelectItem value="Broker">Broker / Investment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Balance (€)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editAcc.balance}
                    onChange={(e) => setEditAcc({ ...editAcc, balance: e.target.value })}
                    required
                    disabled={selectedAccount?.isBankConnected}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Currency</label>
                  <Select value={editAcc.currency} onValueChange={(val) => setEditAcc({ ...editAcc, currency: val })} disabled={selectedAccount?.isBankConnected}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">Cancel</Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

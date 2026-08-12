"use client";

import React, { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { createAccount, updateAccount, deleteAccount } from "./actions";
import { formatCurrency, cn } from "@/lib/utils";
import { Landmark, Wallet, Plus, Trash2, Edit2, Coins, ArrowRightLeft, CreditCard } from "lucide-react";

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  recentTransactions: Array<{
    id: string;
    date: string;
    description: string;
    type: string;
    amount: number;
    category: string;
    color: string;
  }>;
}

interface AccountsClientProps {
  data: {
    accounts: Account[];
  };
}

export function AccountsClient({ data }: AccountsClientProps) {
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // New Account state
  const [newAcc, setNewAcc] = useState({
    name: "",
    type: "Bank",
    balance: "",
  });

  // Edit Account state
  const [editAcc, setEditAcc] = useState({
    id: "",
    name: "",
    type: "",
    balance: "",
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
        setIsAddOpen(false);
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

  const getAccountIcon = (type: string) => {
    switch (type) {
      case "Bank":
        return Landmark;
      case "Trade Republic":
        return Wallet;
      case "Coverflex 1":
      case "Coverflex 2":
        return CreditCard;
      case "Crypto Wallet":
        return Coins;
      default:
        return Wallet;
    }
  };

  const getAccountBadgeColor = (type: string) => {
    switch (type) {
      case "Bank":
        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      case "Trade Republic":
        return "bg-violet-500/10 border-violet-500/20 text-violet-400";
      case "Coverflex 1":
      case "Coverflex 2":
        return "bg-pink-500/10 border-pink-500/20 text-pink-400";
      case "Crypto Wallet":
        return "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";
      default:
        return "bg-neutral-800 border-neutral-700 text-neutral-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Create and oversee your financial entities, wallets, and benefits cards.</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Account
            </Button>
          </DialogTrigger>
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
                        <SelectItem value="Coverflex 1">Coverflex Meal (Benefits)</SelectItem>
                        <SelectItem value="Coverflex 2">Coverflex Benefits</SelectItem>
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
                    <CardTitle className="text-sm font-semibold text-foreground">{acc.name}</CardTitle>
                    <span className={cn("inline-block text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold", getAccountBadgeColor(acc.type))}>
                      {acc.type}
                    </span>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted border border-border text-muted-foreground">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Current Balance</span>
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
                          <span className={cn("font-bold text-[11px]", tx.type === "Income" || tx.type === "Interest" ? "text-emerald-500 dark:text-emerald-400" : "text-foreground")}>
                            {tx.type === "Income" || tx.type === "Interest" ? "+" : "-"}
                            {formatCurrency(tx.amount)}
                          </span>
                        </div>
                      ))}
                      {acc.recentTransactions.length === 0 && (
                        <p className="text-[11px] text-muted-foreground italic py-2">No transaction history found.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </div>

              {/* Card Actions */}
              <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => handleEditTrigger(acc)}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTrigger(acc.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
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
                  <Select value={editAcc.type} onValueChange={(val) => setEditAcc({ ...editAcc, type: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="Trade Republic">Trade Republic</SelectItem>
                      <SelectItem value="Coverflex 1">Coverflex Meal (Benefits)</SelectItem>
                      <SelectItem value="Coverflex 2">Coverflex Benefits</SelectItem>
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
                  />
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

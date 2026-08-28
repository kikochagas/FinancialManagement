"use client";

import React, { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  bulkDeleteTransactions
} from "./actions";
import { buildTransactionPayload, getTransactionPerspective, filterTransactions } from "./utils";
import { formatCurrency, cn } from "@/lib/utils";
import { Search, Plus, Filter, Trash2, Edit2, Check, X, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

interface Transaction {
  id: string;
  date: string;
  createdAt: string;
  description: string;
  direction: "Debit" | "Credit" | "InternalTransfer";
  amount: number;
  accountId: string;
  accountName: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  destinationAccountId: string;
  destinationAccountName: string;
  tags: string;
  notes: string;
}

interface TransactionsClientProps {
  data: {
    transactions: Transaction[];
    accounts: { id: string; name: string; type: string }[];
    categories: { id: string; name: string; systemKey: string; color: string }[];
  };
}

type SortField = "date" | "description" | "direction" | "amount";
type SortOrder = "asc" | "desc";

export function TransactionsClient({ data }: TransactionsClientProps) {
  const [isPending, startTransition] = useTransition();

  // Dialog State
  const [isOpen, setIsOpen] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Inline Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Omit<Transaction, "direction">> & { direction?: "Debit" | "Credit" | "InternalTransfer" }>({});

  // New Transaction Form State
  const [newTx, setNewTx] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    direction: "Debit" as "Debit" | "Credit" | "InternalTransfer",
    amount: "",
    accountId: data.accounts[0]?.id || "none",
    categoryId: data.categories[0]?.id || "",
    destinationAccountId: "",
    tags: "",
    notes: ""
  });

  // Handle Sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (filteredTx: Transaction[]) => {
    if (selectedIds.length === filteredTx.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTx.map((t) => t.id));
    }
  };

  // Inline Edit Trigger
  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditForm({ 
      ...tx
    });
  };

  // Save Inline Edit
  const saveEdit = () => {
    if (!editForm.id) return;
    startTransition(async () => {
      const payload = buildTransactionPayload(editForm);
      const res = await updateTransaction({
        id: editForm.id!,
        ...payload
      });
      if (res?.data?.success) {
        setEditingId(null);
      }
    });
  };

  // Delete Single
  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
      startTransition(async () => {
        await deleteTransaction({ id });
      });
    }
  };

  // Delete Bulk
  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedIds.length} selected transactions?`)) {
      startTransition(async () => {
        await bulkDeleteTransactions({ ids: selectedIds });
        setSelectedIds([]);
      });
    }
  };

  // Create Transaction
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTx.direction === "InternalTransfer" && !newTx.destinationAccountId) {
        alert("Please select a destination account for the internal transfer.");
        return;
    }
    startTransition(async () => {
      const payload = buildTransactionPayload(newTx);
      const res = await createTransaction(payload);
      if (res?.data?.success) {
        setIsOpen(false);
        setNewTx({
          date: new Date().toISOString().split("T")[0],
          description: "",
          direction: "Debit",
          amount: "",
          accountId: data.accounts[0]?.id || "",
          categoryId: data.categories[0]?.id || "",
          destinationAccountId: "",
          tags: "",
          notes: ""
        });
      }
    });
  };

  // Filter Logic
  const filtered = filterTransactions(data.transactions, {
    search,
    directionFilter,
    accountFilter,
    categoryFilter
  });

  // Sorting Logic
  const sorted = [...filtered].sort((a, b) => {
    let multiplier = sortOrder === "asc" ? 1 : -1;
    if (sortField === "date") {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff === 0 && a.createdAt && b.createdAt) {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * multiplier;
      }
      return dateDiff * multiplier;
    }
    if (sortField === "amount") {
      return (a.amount - b.amount) * multiplier;
    }
    if (sortField === "description") {
      return a.description.localeCompare(b.description) * multiplier;
    }
    if (sortField === "direction") {
      return a.direction.localeCompare(b.direction) * multiplier;
    }
    return 0;
  });

  // Pagination Logic
  const pageCount = Math.ceil(sorted.length / itemsPerPage);
  const paginated = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);




  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Manage and audit your transactional cash flow history.</p>
        </div>

        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" className="flex items-center gap-2" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedIds.length})
            </Button>
          )}

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Record
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-background">
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Add Transaction Record</DialogTitle>
                  <DialogDescription>Input new cash flow debit or credit entry.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Row 1: Date & Description */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase">Date</label>
                      <Input type="date" value={newTx.date} onChange={(e) => setNewTx({ ...newTx, date: e.target.value })} required />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase">Amount (€)</label>
                      <Input type="number" step="0.01" placeholder="0.00" value={newTx.amount} onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })} required />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Description</label>
                    <Input type="text" placeholder="e.g. ChatGPT subscription" value={newTx.description} onChange={(e) => setNewTx({ ...newTx, description: e.target.value })} required />
                  </div>

                  {/* Row 2: Type & Account */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase">Direction</label>
                      <Select 
                        value={newTx.direction} 
                        onValueChange={(val) => {
                          const isNowTransfer = val === "InternalTransfer";
                          const defaultTransferCat = data.categories.find(c => c.systemKey === "transfer")?.id || newTx.categoryId;
                          setNewTx({ 
                            ...newTx, 
                            direction: val as any,
                            destinationAccountId: isNowTransfer ? newTx.destinationAccountId : "",
                            categoryId: isNowTransfer ? defaultTransferCat : newTx.categoryId
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select direction" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Debit">Debit</SelectItem>
                          <SelectItem value="Credit">Credit</SelectItem>
                          <SelectItem value="InternalTransfer">Internal Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                        {newTx.direction === "InternalTransfer" ? "From Account" : "Account"}
                      </label>
                      <Select value={newTx.accountId} onValueChange={(val) => setNewTx({ ...newTx, accountId: val })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None / External</SelectItem>
                          {data.accounts.map((ac) => (
                            <SelectItem key={ac.id} value={ac.id}>{ac.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 3: Category / Destination Account */}
                  <div className="grid grid-cols-2 gap-4">
                    {data.categories.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">Category</label>
                        <Select value={newTx.categoryId} onValueChange={(val) => setNewTx({ ...newTx, categoryId: val })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {data.categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {newTx.direction === "InternalTransfer" && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">To Account</label>
                        <Select value={newTx.destinationAccountId} onValueChange={(val) => setNewTx({ ...newTx, destinationAccountId: val === "none" ? "" : val })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Internal transfer to..." />
                          </SelectTrigger>
                          <SelectContent>
                            {data.accounts.filter(a => a.id !== newTx.accountId).map((ac) => (
                              <SelectItem key={ac.id} value={ac.id}>{ac.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Row 4: Tags & Notes */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase">Tags (comma-separated)</label>
                      <Input type="text" placeholder="fixed, tech" value={newTx.tags} onChange={(e) => setNewTx({ ...newTx, tags: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase">Notes (optional)</label>
                      <Input type="text" placeholder="Internal memo" value={newTx.notes} onChange={(e) => setNewTx({ ...newTx, notes: e.target.value })} />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" size="sm">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" size="sm" disabled={isPending}>
                    {isPending ? "Saving..." : "Save Record"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter Options Card */}
      <Card className="border-border bg-card/50 shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search descriptions, tags..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter by Type */}
            <div className="w-[140px]">
              <Select value={directionFilter} onValueChange={(val) => { setDirectionFilter(val); setCurrentPage(1); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Directions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="Debit">Debit</SelectItem>
                  <SelectItem value="Credit">Credit</SelectItem>
                  <SelectItem value="InternalTransfer">Internal Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Account */}
            <div className="w-[160px]">
              <Select value={accountFilter} onValueChange={(val) => { setAccountFilter(val); setCurrentPage(1); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {data.accounts.map((ac) => (
                    <SelectItem key={ac.id} value={ac.id}>{ac.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Category */}
            <div className="w-[150px]">
              <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setCurrentPage(1); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {data.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ledger Table Card */}
      <Card className="border-border bg-card/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm text-card-foreground">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground font-semibold">
                  <th className="p-4 w-[40px]">
                    <input
                      type="checkbox"
                      className="rounded border-input bg-background accent-primary h-3.5 w-3.5"
                      checked={selectedIds.length === paginated.length && paginated.length > 0}
                      onChange={() => toggleSelectAll(paginated)}
                    />
                  </th>
                  <th className="p-4 cursor-pointer select-none" onClick={() => handleSort("date")}>
                    <div className="flex items-center gap-1.5 hover:text-foreground">
                      Date <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer select-none" onClick={() => handleSort("description")}>
                    <div className="flex items-center gap-1.5 hover:text-foreground">
                      Description <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer select-none" onClick={() => handleSort("direction")}>
                    <div className="flex items-center gap-1.5 hover:text-foreground">
                      Direction <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="p-4">Account</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Tags</th>
                  <th className="p-4 cursor-pointer select-none text-right" onClick={() => handleSort("amount")}>
                    <div className="flex items-center justify-end gap-1.5 hover:text-foreground">
                      Amount <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((tx) => {
                  const isEditing = editingId === tx.id;
                  return (
                    <tr
                      key={tx.id}
                      className={cn(
                        "hover:bg-accent/40 transition-colors",
                        isEditing && "bg-accent/80"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="p-4">
                        <input
                          type="checkbox"
                          className="rounded border-input bg-background accent-primary h-3.5 w-3.5"
                          checked={selectedIds.includes(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                          disabled={isEditing}
                        />
                      </td>

                      {/* Date */}
                      <td className="p-4 font-mono text-xs">
                        {isEditing ? (
                          <Input
                            type="date"
                            value={editForm.date || ""}
                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                            className="h-8 py-0.5 px-2 text-xs font-mono w-[120px]"
                          />
                        ) : (
                          tx.date
                        )}
                      </td>

                      {/* Description */}
                      <td className="p-4 font-semibold text-foreground">
                        {isEditing ? (
                          <Input
                            type="text"
                            value={editForm.description || ""}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="h-8 py-0.5 px-2 text-xs w-[180px]"
                          />
                        ) : (
                          tx.description
                        )}
                      </td>

                      {/* Direction */}
                      <td className="p-4 text-xs font-medium">
                        {isEditing ? (
                          <div className="w-[110px]">
                            <Select
                              value={editForm.direction}
                              onValueChange={(val) => {
                                const isNowTransfer = val === "InternalTransfer";
                                setEditForm({ 
                                  ...editForm, 
                                  direction: val as any,
                                  destinationAccountId: isNowTransfer ? editForm.destinationAccountId : undefined
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs py-0.5">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Debit">Debit</SelectItem>
                                <SelectItem value="Credit">Credit</SelectItem>
                                <SelectItem value="InternalTransfer">Internal Transfer</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold border",
                              tx.direction === "Credit" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                              tx.direction === "Debit" && "bg-accent border-border text-foreground",
                              tx.direction === "InternalTransfer" && "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                            )}
                          >
                            {tx.direction === "InternalTransfer" ? "Transfer" : tx.direction}
                          </span>
                        )}
                      </td>

                      {/* Account */}
                      <td className="p-4 text-muted-foreground text-xs">
                        {isEditing ? (
                          <div className="w-[130px]">
                            <Select
                              value={editForm.accountId}
                              onValueChange={(val) => setEditForm({ ...editForm, accountId: val })}
                            >
                              <SelectTrigger className="h-8 text-xs py-0.5">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None / External</SelectItem>
                                {data.accounts.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : tx.direction === "InternalTransfer" ? (
                          <span>{tx.accountName} &rarr; {tx.destinationAccountName}</span>
                        ) : (
                          tx.accountName
                        )}
                      </td>

                      {/* Category */}
                      <td className="p-4 text-xs font-semibold">
                        {isEditing ? (
                          <div className="flex gap-2">
                            {data.categories.length > 0 && (
                              <div className="w-[130px]">
                                <Select
                                  value={editForm.categoryId || undefined}
                                  onValueChange={(val) => setEditForm({ ...editForm, categoryId: val })}
                                >
                                  <SelectTrigger className="h-8 text-xs py-0.5">
                                    <SelectValue placeholder="Category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {data.categories.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {editForm.direction === "InternalTransfer" && (
                              <div className="w-[130px]">
                                <Select
                                  value={editForm.destinationAccountId || ""}
                                  onValueChange={(val) => setEditForm({ ...editForm, destinationAccountId: val })}
                                >
                                  <SelectTrigger className="h-8 text-xs py-0.5">
                                    <SelectValue placeholder="Destination" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {data.accounts.filter(a => a.id !== editForm.accountId).map((a) => (
                                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: tx.categoryColor }}>{tx.categoryName}</span>
                        )}
                      </td>

                      {/* Tags */}
                      <td className="p-4">
                        {isEditing ? (
                          <Input
                            type="text"
                            value={editForm.tags || ""}
                            onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                            className="h-8 py-0.5 px-2 text-xs w-[120px]"
                          />
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {tx.tags.split(",").filter(Boolean).map((tg: string) => (
                              <span key={tg} className="text-[10px] bg-accent/50 border border-border text-muted-foreground px-1.5 py-0.5 rounded">
                                {tg}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="p-4 text-right font-mono font-bold text-foreground">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editForm.amount || ""}
                            onChange={(e) => setEditForm({ ...editForm, amount: Number(e.target.value) })}
                            className="h-8 py-0.5 px-2 text-xs text-right font-mono w-[100px]"
                          />
                        ) : (
                          (() => {
                            const p = getTransactionPerspective(tx, accountFilter);
                            return (
                              <span className={cn("font-bold text-[11px]", p.color)}>
                                {p.sign}{formatCurrency(Math.abs(tx.amount))}
                              </span>
                            );
                          })()
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={saveEdit}
                              className="text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300 p-1 hover:bg-emerald-500/10 rounded"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-muted-foreground hover:text-foreground p-1 hover:bg-accent rounded"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => startEdit(tx)}
                              className="text-muted-foreground hover:text-foreground p-1 hover:bg-accent rounded"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(tx.id)}
                              className="text-muted-foreground hover:text-destructive p-1 hover:bg-destructive/10 rounded"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground text-xs">
                      No records matched the filter query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {pageCount > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">
                Page {currentPage} of {pageCount} ({filtered.length} entries total)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(pageCount, prev + 1))}
                  disabled={currentPage === pageCount}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import React, { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { createGoal, updateGoal, deleteGoal } from "./actions";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import { Target, Plus, Shield, Home, Calendar, Award, Trash2, Edit2, Coins } from "lucide-react";

interface Goal {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  currentAmount: number;
  progress: number;
  estimatedCompletion: string;
}

interface GoalsClientProps {
  data: {
    goals: Goal[];
  };
}

export function GoalsClient({ data }: GoalsClientProps) {
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  // Form states
  const [newGoal, setNewGoal] = useState({
    name: "",
    type: "Custom",
    targetAmount: "",
    currentAmount: "",
    estimatedCompletion: "",
  });

  const [editGoalForm, setEditGoalForm] = useState({
    id: "",
    name: "",
    type: "",
    targetAmount: "",
    currentAmount: "",
    estimatedCompletion: "",
  });

  const [quickAmount, setQuickAmount] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createGoal({
        name: newGoal.name,
        type: newGoal.type,
        targetAmount: Number(newGoal.targetAmount),
        currentAmount: Number(newGoal.currentAmount) || 0,
        estimatedCompletion: newGoal.estimatedCompletion || null,
      });
      if (res?.data?.success) {
        setIsAddOpen(false);
        setNewGoal({ name: "", type: "Custom", targetAmount: "", currentAmount: "", estimatedCompletion: "" });
      }
    });
  };

  const handleEditTrigger = (goal: Goal) => {
    setSelectedGoal(goal);
    setEditGoalForm({
      id: goal.id,
      name: goal.name,
      type: goal.type,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
      estimatedCompletion: goal.estimatedCompletion,
    });
    setIsEditOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateGoal({
        id: editGoalForm.id,
        name: editGoalForm.name,
        type: editGoalForm.type,
        targetAmount: Number(editGoalForm.targetAmount),
        currentAmount: Number(editGoalForm.currentAmount),
        estimatedCompletion: editGoalForm.estimatedCompletion || null,
      });
      if (res?.data?.success) {
        setIsEditOpen(false);
      }
    });
  };

  const handleQuickTrigger = (goal: Goal) => {
    setSelectedGoal(goal);
    setQuickAmount("");
    setIsQuickOpen(true);
  };

  const handleQuickDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal) return;
    startTransition(async () => {
      const newAmount = selectedGoal.currentAmount + (Number(quickAmount) || 0);
      const res = await updateGoal({
        id: selectedGoal.id,
        currentAmount: newAmount,
      });
      if (res?.data?.success) {
        setIsQuickOpen(false);
      }
    });
  };

  const handleDeleteTrigger = (id: string) => {
    if (confirm("Are you sure you want to delete this goal?")) {
      startTransition(async () => {
        await deleteGoal({ id });
      });
    }
  };

  const getGoalIcon = (type: string) => {
    switch (type) {
      case "Emergency Fund":
        return Shield;
      case "House":
        return Home;
      case "IRS":
        return Award;
      default:
        return Target;
    }
  };

  const getGoalBadgeColor = (type: string) => {
    switch (type) {
      case "Emergency Fund":
        return "bg-cyan-500/10 border-cyan-500/20 text-cyan-400";
      case "House":
        return "bg-pink-500/10 border-pink-500/20 text-pink-400";
      case "IRS":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      default:
        return "bg-violet-500/10 border-violet-500/20 text-violet-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Track long-term reserve allocations and savings milestones.</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Goal
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-background">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Add Wealth Goal</DialogTitle>
                <DialogDescription>Initiate a new financial aspiration or budget target.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Goal Name</label>
                  <Input
                    type="text"
                    placeholder="e.g. Down Payment for Apartment"
                    value={newGoal.name}
                    onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Goal Type</label>
                    <Select value={newGoal.type} onValueChange={(val) => setNewGoal({ ...newGoal, type: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Emergency Fund">Emergency Fund</SelectItem>
                        <SelectItem value="House">House</SelectItem>
                        <SelectItem value="IRS">IRS Tax Fund</SelectItem>
                        <SelectItem value="Custom">Custom Goal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Estimated Completion</label>
                    <Input
                      type="text"
                      placeholder="e.g. Dec 2028"
                      value={newGoal.estimatedCompletion}
                      onChange={(e) => setNewGoal({ ...newGoal, estimatedCompletion: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Target Amount (€)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newGoal.targetAmount}
                      onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">Current Seed Amount (€)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newGoal.currentAmount}
                      onChange={(e) => setNewGoal({ ...newGoal, currentAmount: e.target.value })}
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

      {/* Grid of Goals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.goals.map((goal) => {
          const Icon = getGoalIcon(goal.type);
          return (
            <Card key={goal.id} className="border-border bg-card/50 shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-semibold text-foreground">{goal.name}</CardTitle>
                    <span className={cn("inline-block text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold", getGoalBadgeColor(goal.type))}>
                      {goal.type}
                    </span>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted border border-border text-muted-foreground">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  {/* Progress info */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">Accumulation Progress</span>
                      <span className="font-bold text-violet-400 dark:text-violet-500">{goal.progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={goal.progress} className="h-2 bg-muted border border-border" />
                  </div>

                  {/* Pricing details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Current balance</span>
                      <div className="text-base font-extrabold text-foreground mt-0.5">{formatCurrency(goal.currentAmount)}</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Target amount</span>
                      <div className="text-base font-extrabold text-muted-foreground mt-0.5">{formatCurrency(goal.targetAmount)}</div>
                    </div>
                  </div>

                  {/* Completion Date */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-lg border border-border">
                    <Calendar className="h-3.5 w-3.5 text-violet-400 dark:text-violet-500" />
                    <span>Completion target: <strong className="text-foreground">{goal.estimatedCompletion}</strong></span>
                  </div>
                </CardContent>
              </div>

              {/* Card Footer Actions */}
              <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:text-emerald-300" onClick={() => handleQuickTrigger(goal)}>
                  <Coins className="h-3.5 w-3.5 mr-1" /> Contribute
                </Button>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleEditTrigger(goal)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTrigger(goal.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
              <DialogTitle>Edit Goal settings</DialogTitle>
              <DialogDescription>Modify variables for {selectedGoal?.name}.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">Goal Name</label>
                <Input
                  type="text"
                  value={editGoalForm.name}
                  onChange={(e) => setEditGoalForm({ ...editGoalForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Goal Type</label>
                  <Select value={editGoalForm.type} onValueChange={(val) => setEditGoalForm({ ...editGoalForm, type: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Emergency Fund">Emergency Fund</SelectItem>
                      <SelectItem value="House">House</SelectItem>
                      <SelectItem value="IRS">IRS Tax Fund</SelectItem>
                      <SelectItem value="Custom">Custom Goal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Estimated Completion</label>
                  <Input
                    type="text"
                    value={editGoalForm.estimatedCompletion}
                    onChange={(e) => setEditGoalForm({ ...editGoalForm, estimatedCompletion: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Target Amount (€)</label>
                  <Input
                    type="number"
                    value={editGoalForm.targetAmount}
                    onChange={(e) => setEditGoalForm({ ...editGoalForm, targetAmount: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Current Amount (€)</label>
                  <Input
                    type="number"
                    value={editGoalForm.currentAmount}
                    onChange={(e) => setEditGoalForm({ ...editGoalForm, currentAmount: e.target.value })}
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
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Deposit Dialog */}
      <Dialog open={isQuickOpen} onOpenChange={setIsQuickOpen}>
        <DialogContent className="border-border bg-background max-w-sm">
          <form onSubmit={handleQuickDeposit}>
            <DialogHeader>
              <DialogTitle>Contribute to Goal</DialogTitle>
              <DialogDescription>Quickly inject savings into {selectedGoal?.name}.</DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">Contribution Amount (€)</label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">Cancel</Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Injecting..." : "Confirm Deposit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

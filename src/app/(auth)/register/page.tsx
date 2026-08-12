"use client";

import { useState } from "react";
import { register } from "@/features/auth/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, UserPlus } from "lucide-react";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(null);
    const res = await register(formData);
    if (res?.error) {
      setError(res.error);
      setIsPending(false);
    }
  }

  return (
    <Card className="border-border bg-card/50 shadow-sm animate-in fade-in-50 zoom-in-95">
      <CardHeader className="space-y-2 text-center pb-6">
        <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-2">
          <UserPlus className="w-6 h-6 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Create an account</CardTitle>
        <CardDescription className="text-muted-foreground">
          Start managing your wealth today
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-destructive-foreground bg-destructive/10 border border-destructive/20 rounded-lg">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
            <Input 
              name="name"
              type="text" 
              placeholder="John Doe"
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email address</label>
            <Input 
              name="email"
              type="email" 
              placeholder="name@example.com"
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Password</label>
            <Input 
              name="password"
              type="password" 
              required
              minLength={6}
              className="bg-background"
            />
          </div>
          <Button type="submit" className="w-full font-semibold" disabled={isPending}>
            {isPending ? "Creating account..." : "Create Account"}
            {!isPending && <ArrowRight className="w-4 h-4 ml-2" />}
          </Button>
        </form>
        
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline font-semibold">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Coins, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { navLinks } from "./nav-links";
import { logout } from "@/features/auth/actions";

export function MobileNav({ user }: { user?: { name: string | null; email: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          className="md:hidden text-muted-foreground hover:text-foreground p-1"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-sm border-r border-border bg-card p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-300 flex flex-col">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-glow">
                <Coins className="h-5 w-5" />
              </div>
              <span className="font-semibold text-base tracking-tight bg-gradient-to-r from-foreground via-foreground/80 to-muted-foreground bg-clip-text text-transparent">
                Fm. Wealth
              </span>
            </Link>
            <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
              <X className="h-5 w-5 text-muted-foreground" />
              <span className="sr-only">Close menu</span>
            </DialogPrimitive.Close>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <nav className="flex flex-col space-y-2">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                      isActive
                        ? "bg-accent text-accent-foreground border-l-2 border-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          {user && (
            <div className="mt-auto pt-4 border-t border-border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center font-bold text-white text-sm shadow">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-semibold text-foreground truncate">{user.name || "User"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
              <form action={logout}>
                <button className="w-full py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors font-medium border border-transparent hover:border-destructive/20">
                  Log out
                </button>
              </form>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

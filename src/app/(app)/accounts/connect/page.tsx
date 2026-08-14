import { ConnectClient } from "@/features/accounts/components/connect-client";

export default function ConnectBankPage() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Connect a Bank</h1>
        <p className="text-muted-foreground text-sm">
          Select a bank to securely connect your account.
        </p>
      </div>
      <ConnectClient />
    </div>
  );
}

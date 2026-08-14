"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Landmark, Search, ChevronLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface Institution {
  id: string;
  name: string;
  logo: string;
  country: string;
}

export function ConnectClient() {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isConnecting, setIsConnecting] = useState<string | null>(null); // holds ID of bank being connected

  useEffect(() => {
    async function fetchInstitutions() {
      try {
        const res = await fetch("/api/banking/institutions");
        if (!res.ok) {
          throw new Error("Failed to load institutions");
        }
        const data = await res.json();
        setInstitutions(data.institutions || []);
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }
    fetchInstitutions();
  }, []);

  const handleConnect = async (institution: Institution) => {
    if (isConnecting) return;
    setIsConnecting(institution.id);
    try {
      const res = await fetch("/api/banking/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionName: institution.name,
          institutionCountry: institution.country
        })
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.error || "Failed to initiate connection");
      }
      
      window.location.assign(data.authorizationUrl);
    } catch (err: any) {
      setError(err.message || "Failed to connect to bank");
      setIsConnecting(null);
    }
  };

  const filteredInstitutions = institutions.filter((inst) => 
    inst.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/accounts">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Accounts
          </Link>
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm font-semibold p-4 rounded-md border border-destructive/20">
          {error}
        </div>
      )}

      <Card className="border-border">
        <CardContent className="p-6 space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search institutions..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInstitutions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No institutions found matching "{search}"
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredInstitutions.map((inst) => (
                <div 
                  key={inst.id}
                  onClick={() => handleConnect(inst)}
                  className={`p-4 border rounded-lg flex items-center gap-4 transition-colors ${
                    isConnecting && isConnecting !== inst.id 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'cursor-pointer hover:bg-muted/50 hover:border-primary/50'
                  }`}
                >
                  <div className="h-10 w-10 shrink-0 bg-secondary rounded-md flex items-center justify-center overflow-hidden border">
                    <Landmark className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 truncate">
                    <h3 className="font-semibold text-sm truncate">{inst.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{inst.country}</p>
                  </div>
                  {isConnecting === inst.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import React, { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { getSheetData, determineBestSheet } from "../../bank-import/workbook";
import { detectHeaderRow, normalizeHeader } from "../header-detection";
import { getProvenanceLabel, validateMappings, getFriendlyActivityLabel } from "../ux-helpers";
import { ColumnMapping, ParsedBrokerTransaction } from "../types";
import { importBrokerTransactionsAction, mapBrokerColumnsWithAIAction, previewBrokerDuplicatesAction } from "../actions";
import { createAccount } from "@/features/accounts/actions";
import { calculateAccountBalance } from "../cash-balance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";

export function BrokerTransactionImportWizard({ accounts }: { accounts: any[] }) {
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [step, setStep] = useState(1);
  const [fileData, setFileData] = useState<any[][] | null>(null);
  
  const [headerRowIdx, setHeaderRowIdx] = useState<number | null>(null);
  const [headerInputRaw, setHeaderInputRaw] = useState<string>("");
  
  const [mapping, setMapping] = useState<Record<number, ColumnMapping>>({});
  const [aiAttempted, setAiAttempted] = useState<boolean>(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [generalWarnings, setGeneralWarnings] = useState<string[]>([]);
  
  const [eventTypeOverrides, setEventTypeOverrides] = useState<Record<string, string>>({});
  const [distinctEventTypes, setDistinctEventTypes] = useState<{raw: string, canonical: string | null}[]>([]);

  const [transactions, setTransactions] = useState<(ParsedBrokerTransaction & { import: boolean, isProbableDuplicate?: boolean, candidateIndex?: number })[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState("Broker");
  const [newAccCurrency, setNewAccCurrency] = useState("EUR");

  const [currentAccountBalance, setCurrentAccountBalance] = useState<number | null>(null);
  const [existingLedgerBalance, setExistingLedgerBalance] = useState<number | null>(null);
  const [existingLedgerBalanceSafe, setExistingLedgerBalanceSafe] = useState(false);
  const [accountCurrency, setAccountCurrency] = useState("");
  const [updateCashBalance, setUpdateCashBalance] = useState(false);

  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Reading file...");
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const bestSheet = determineBestSheet(wb);
        if (bestSheet) {
          const ws = wb.Sheets[bestSheet];
          const rows = getSheetData(ws);
          setFileData(rows);
          const headerIdx = detectHeaderRow(rows);
          setHeaderRowIdx(headerIdx);
        }
        setStatus("");
        setStep(2);
      } catch (err) {
        setStatus("Error reading file.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const proceedToMapping = async () => {
    if (!fileData || headerRowIdx === null) return;
    setStatus("Analyzing columns...");
    const headers = fileData[headerRowIdx].map(h => String(h || "").trim());
    const normalizedHeaders = headers.map(normalizeHeader);

    try {
      const { orchestrateBrokerColumnMapping } = await import("../orchestrator");
      
      const mapper = {
        mapColumns: async (cols: any) => {
          const res = await mapBrokerColumnsWithAIAction({ columns: cols });
          if (res?.data?.success && res.data.result) {
            return res.data.result;
          }
          throw new Error("AI Action failed");
        }
      };

      const result = await orchestrateBrokerColumnMapping(headers, normalizedHeaders, fileData, headerRowIdx, mapper);
      
      setMapping(result.mapping);
      setAiAttempted(result.aiAttempted);
      setAiWarnings(result.aiError ? [result.aiError] : []);
      setGeneralWarnings(result.warnings || []);
      
      setStatus(result.aiSucceeded ? "AI-assisted mapping was used for ambiguous columns." : "Columns mapped automatically using known patterns.");
    } catch (err) {
      console.error(err);
      setStatus("Error analyzing columns.");
    }
    
    setStep(3);
  };

  const handleMappingChange = (index: number, newSemantic: string) => {
    setMapping(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        semantic: newSemantic as any,
        source: "user"
      }
    }));
  };

  const parseWithMapping = async () => {
    if (!fileData) return;

    try {
      const res = await (await import("../parser")).parseBrokerTransactions(
        fileData,
        mapping,
        undefined,
        headerRowIdx!
      );

      // Extract distinct event types
      const distinct = Array.from(new Set(res.transactions.map(t => t.rawEventType).filter(Boolean))) as string[];
      const defaultOverrides: Record<string, string> = {};
      const distinctTypes = distinct.map(raw => {
         const canonical = res.transactions.find(t => t.rawEventType === raw)?.eventType || null;
         defaultOverrides[raw] = canonical || "";
         return { raw, canonical };
      });
      
      setDistinctEventTypes(distinctTypes);
      setEventTypeOverrides(defaultOverrides);
      
      setStatus("");
      setStep(4);
    } catch (e) {
      console.error(e);
      setStatus("Error parsing transactions with mapping.");
    }
  };

  const confirmEventTypes = async () => {
    if (!fileData) return;
    
    // Require all distinct event types to be mapped
    const hasUnmapped = distinctEventTypes.some(dt => !eventTypeOverrides[dt.raw]);
    if (hasUnmapped) {
      setStatus("Please select a canonical event type (or IGNORE) for all raw event types.");
      return;
    }

    try {
      const res = await (await import("../parser")).parseBrokerTransactions(
        fileData,
        mapping,
        eventTypeOverrides,
        headerRowIdx!
      );
      setTransactions(res.transactions.map((t, idx) => ({ ...t, import: t.valid && t.eventType !== "IGNORE", candidateIndex: idx })));
      setStep(5);
      setStatus("");
    } catch(e) {
      console.error(e);
      setStatus("Error confirming event types");
    }
  };

  const proceedToReview = async () => {
    if (!selectedAccountId) return;
    setStatus("Checking for duplicates...");
    setStep(6);
    try {
      const candidates = transactions.filter(t => t.import && t.eventType !== "IGNORE").map(t => ({
        occurredAt: t.occurredAt!,
        eventType: t.eventType!,
        rawEventType: t.rawEventType,
        rawCategory: t.rawCategory,
        assetClass: t.assetClass,
        instrumentName: t.instrumentName,
        instrumentIdentifier: t.instrumentIdentifier,
        isin: t.isin,
        ticker: t.ticker,
        quantity: t.quantity,
        unitPrice: t.unitPrice,
        amount: t.amount,
        fee: t.fee,
        tax: t.tax,
        currency: t.currency,
        originalAmount: t.originalAmount,
        originalCurrency: t.originalCurrency,
        fxRate: t.fxRate,
        description: t.description,
        externalId: t.externalId,
        sourceRow: t.sourceRow,
        candidateIndex: t.candidateIndex
      }));

      const res = await previewBrokerDuplicatesAction({ accountId: selectedAccountId, transactions: candidates });
      if (res?.data?.success) {
        const dupes = res.data.duplicateIndices;
        setTransactions(prev => prev.map(t => ({
          ...t,
          isProbableDuplicate: dupes.includes(t.candidateIndex!),
          import: dupes.includes(t.candidateIndex!) ? false : t.import
        })));
        if (res.data.currentAccountBalance !== undefined) {
          setCurrentAccountBalance(res.data.currentAccountBalance);
          setExistingLedgerBalance(res.data.existingLedgerBalance);
          setExistingLedgerBalanceSafe(res.data.existingLedgerBalanceSafe);
          setAccountCurrency(res.data.accountCurrency);
          
          if (res.data.currentAccountBalance === 0 && res.data.existingLedgerBalanceSafe) {
            setUpdateCashBalance(true);
          } else {
            setUpdateCashBalance(false);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
    setStatus("");
  };

  const handleImport = () => {
    setStep(6);
    setStatus("Importing transactions...");
    startTransition(async () => {
      const payload = transactions.filter(t => t.import && t.eventType !== "IGNORE").map(t => ({
        occurredAt: t.occurredAt!,
        eventType: t.eventType!,
        rawEventType: t.rawEventType,
        rawCategory: t.rawCategory,
        assetClass: t.assetClass,
        instrumentName: t.instrumentName,
        instrumentIdentifier: t.instrumentIdentifier,
        isin: t.isin,
        ticker: t.ticker,
        quantity: t.quantity,
        unitPrice: t.unitPrice,
        amount: t.amount,
        fee: t.fee,
        tax: t.tax,
        currency: t.currency,
        originalAmount: t.originalAmount,
        originalCurrency: t.originalCurrency,
        fxRate: t.fxRate,
        description: t.description,
        externalId: t.externalId,
        sourceRow: t.sourceRow,
      }));

      setStatus("");
      setStep(7);
      try {
        const res = await importBrokerTransactionsAction({ 
          accountId: selectedAccountId, 
          transactions: payload,
          updateCashBalance 
        });
        if (res?.data?.success) {
          const clientSkipped = transactions.filter(t => t.isProbableDuplicate && !t.import).length;
          setSummary({
            candidateTransactions: transactions.length,
            imported: res.data.insertedCount,
            skipped: res.data.skippedCount + clientSkipped,
            balanceUpdated: res.data.balanceUpdated,
            resultingBalance: res.data.resultingBalance
          });
          setStep(8);
        } else {
          setStatus("Import failed.");
          setStep(6);
        }
      } catch (e: any) {
        console.error(e);
        setStatus(e.message || "Error importing transactions.");
        setStep(6);
      }
    });
  };

  const hasUnmappedEvents = distinctEventTypes.some(dt => !eventTypeOverrides[dt.raw]);

  // Dynamically compute balance based on checked transactions
  const candidateCalculation = React.useMemo(() => {
    const selectedTx = transactions
      .filter(tx => tx.import && !tx.isProbableDuplicate && tx.valid && tx.eventType !== "IGNORE")
      .map(tx => tx as any);
      
    return calculateAccountBalance(selectedTx, accountCurrency);
  }, [transactions, accountCurrency]);

  const computedBalance = existingLedgerBalance !== null ? Math.round((existingLedgerBalance + candidateCalculation.balance) * 100) / 100 : null;
  const isBalanceSafe = existingLedgerBalanceSafe && candidateCalculation.isSafe;

  React.useEffect(() => {
    if (!isBalanceSafe) {
      setUpdateCashBalance(false);
    }
  }, [isBalanceSafe]);

  // Derived values for step 6 rendering
  const readyCount = transactions.filter(t => t.import && !t.isProbableDuplicate && t.valid && t.eventType !== "IGNORE").length;
  const duplicateCount = transactions.filter(t => t.isProbableDuplicate).length;
  const ignoredCount = transactions.filter(t => t.eventType === "IGNORE").length;
  const invalidCount = transactions.filter(t => !t.valid && t.eventType !== "IGNORE").length;

  return (
    <Card className="w-full mt-4">
      <CardHeader>
        <CardTitle>Broker Transaction Import</CardTitle>
        <CardDescription>Step {step} of 8</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && <div className="p-3 bg-muted text-sm rounded-md mb-4">{status}</div>}

        {step === 1 && (
          <div className="flex items-center justify-center border-2 border-dashed rounded-lg p-6 bg-muted/20">
            <label className="cursor-pointer text-violet-500">
              Upload CSV file
              <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
            </label>
          </div>
        )}

        {step === 2 && fileData && (
          <div className="space-y-4">
            <h3 className="font-semibold">Confirm Header Row</h3>
            {headerRowIdx !== null ? (
              <>
                <p className="text-sm text-muted-foreground">
                  We detected the row containing your file's column names. Confirm the detected headers below. You normally only need to change this if the preview looks incorrect.
                </p>
                <div className="text-sm border p-3 rounded max-h-32 overflow-auto bg-muted/20">
                  <strong>Detected column headers:</strong><br />
                  {fileData[headerRowIdx].map(h => String(h||"").trim()).join(", ")}
                </div>
                <div className="pt-2">
                  <label className="text-sm text-muted-foreground mr-2">Change detected header row (1-indexed):</label>
                  <Input 
                    type="number" 
                    min={1}
                    value={headerRowIdx + 1} 
                    onChange={e => setHeaderRowIdx(Math.max(0, parseInt(e.target.value, 10) - 1))} 
                    className="w-24 inline-block h-8"
                  />
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm text-red-500 mb-2">Could not confidently identify the header row.</p>
                <label className="text-sm">Header row number (1-indexed):</label>
                <Input type="number" min={1} value={headerInputRaw} onChange={e => {
                  setHeaderInputRaw(e.target.value);
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= fileData!.length && fileData![val - 1]) {
                    setHeaderRowIdx(val - 1);
                  } else {
                    setHeaderRowIdx(null);
                  }
                }} />
              </div>
            )}
            
            <Button onClick={proceedToMapping} disabled={headerRowIdx === null || headerRowIdx < 0 || headerRowIdx >= fileData.length}>Continue</Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Column Mapping</h3>
            <p className="text-sm text-muted-foreground">
              FinancialManagement needs to understand what each column in your broker file represents. We've mapped the columns automatically. Review the suggestions below and only change something if it looks incorrect.
            </p>
            
            {aiAttempted && aiWarnings.length > 0 && (
              <div className="p-3 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-md text-sm">
                <p className="font-medium mb-1">AI-assisted mapping was unavailable.</p>
                <p>Automatic mappings are shown below for manual review.</p>
              </div>
            )}
            {generalWarnings.length > 0 && (
              <div className="p-3 bg-blue-50 text-blue-800 border border-blue-200 rounded-md text-sm">
                <ul className="list-disc pl-5">
                  {generalWarnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            <div className="space-y-2 mt-4">
              {Object.values(mapping).map((m) => {
                const isValidating = validateMappings(mapping);
                const isDuplicate = m.semantic && m.semantic !== "IGNORE" && isValidating.duplicates.includes(m.semantic);
                return (
                  <div key={m.columnIndex} className="flex justify-between items-center border-b pb-2 text-sm">
                    <div className="flex-1">
                      <span className="font-medium">{m.header}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({getProvenanceLabel(m.source, m.confidence, m.semantic)})
                      </span>
                    </div>
                    <select 
                      className={`border rounded p-1 w-64 bg-background text-foreground ${isDuplicate ? 'border-red-500 ring-1 ring-red-500 focus:ring-red-500 focus:border-red-500' : 'border-input'}`}
                      value={m.semantic || "UNMAPPED"}
                      onChange={(e) => handleMappingChange(m.columnIndex, e.target.value)}
                    >
                      <option value="UNMAPPED">-- Not mapped --</option>
                      <option value="IGNORE">Ignore column</option>
                      <option value="DATETIME">Transaction date & time</option>
                      <option value="DATE">Transaction date</option>
                      <option value="EVENT_TYPE">Broker activity type</option>
                      <option value="SOURCE_CATEGORY">Original broker category</option>
                      <option value="ASSET_CLASS">Asset class</option>
                      <option value="INSTRUMENT_NAME">Investment name</option>
                      <option value="INSTRUMENT_IDENTIFIER">Instrument identifier</option>
                      <option value="ISIN">ISIN</option>
                      <option value="TICKER">Ticker / symbol</option>
                      <option value="QUANTITY">Quantity</option>
                      <option value="UNIT_PRICE">Price per unit</option>
                      <option value="AMOUNT">Cash amount</option>
                      <option value="FEE">Fee</option>
                      <option value="TAX">Tax</option>
                      <option value="CURRENCY">Currency</option>
                      <option value="ORIGINAL_AMOUNT">Original-currency amount</option>
                      <option value="ORIGINAL_CURRENCY">Original currency</option>
                      <option value="FX_RATE">Exchange rate</option>
                      <option value="EXTERNAL_ID">Unique transaction ID</option>
                      <option value="DESCRIPTION">Description</option>
                    </select>
                  </div>
                );
              })}
            </div>
            
            {(() => {
              const { isValid, missingRequired, duplicates } = validateMappings(mapping);
              if (isValid) return null;
              return (
                <div className="text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-md">
                  {missingRequired && <p>Please map both a Date/Datetime and a Broker activity type.</p>}
                  {duplicates.length > 0 && <p>Duplicate assignments detected. Each mapped property must be unique.</p>}
                </div>
              );
            })()}

            <div className="text-xs text-muted-foreground space-y-1 mt-4 p-3 bg-muted/10 rounded-md">
              <p><strong>Instrument identifier:</strong> Identifies the investment, for example an ISIN such as US8740541094 or a ticker such as BTC.</p>
              <p><strong>Unique transaction ID:</strong> Used to recognize the same broker transaction and prevent duplicate imports.</p>
              <p><strong>Original broker category:</strong> Preserved from the broker for reference. It is not a FinancialManagement income/expense category.</p>
              <p><strong>Cash amount:</strong> The signed cash value reported by the broker. Negative and positive signs are preserved.</p>
            </div>

            <Button onClick={parseWithMapping} disabled={!validateMappings(mapping).isValid}>Confirm Mappings</Button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Event Type Normalization</h3>
            <p className="text-sm text-muted-foreground">
              Brokers use different names for investment activity. FinancialManagement translates those names into standard event types so your investment history can be understood consistently across different brokers.
            </p>
            {distinctEventTypes.map((dt) => (
              <div key={dt.raw} className="flex justify-between items-center border-b pb-2 text-sm">
                <span className="font-medium w-1/3">{dt.raw}</span>
                <span className="text-muted-foreground px-2">&rarr;</span>
                <select 
                  className={`border rounded p-1 flex-1 bg-background text-foreground ${!eventTypeOverrides[dt.raw] ? 'border-red-500 ring-1 ring-red-500 focus:ring-red-500 focus:border-red-500' : 'border-input'}`}
                  value={eventTypeOverrides[dt.raw] || ""}
                  onChange={(e) => setEventTypeOverrides(prev => ({ ...prev, [dt.raw]: e.target.value }))}
                >
                  <option value="">-- Choose... --</option>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                  <option value="DIVIDEND">Dividend</option>
                  <option value="INTEREST">Interest</option>
                  <option value="CASH_DEPOSIT">Cash deposit</option>
                  <option value="CASH_WITHDRAWAL">Cash withdrawal</option>
                  <option value="ASSET_TRANSFER_IN">Asset received</option>
                  <option value="ASSET_TRANSFER_OUT">Asset transferred out</option>
                  <option value="FEE">Fee</option>
                  <option value="TAX">Tax</option>
                  <option value="CORPORATE_ACTION">Corporate action</option>
                  <option value="OTHER">Other</option>
                  <option value="IGNORE">Ignore this activity</option>
                </select>
              </div>
            ))}

            <div className="text-xs text-muted-foreground space-y-1 mt-4 p-3 bg-muted/10 rounded-md">
              <p><strong>Other:</strong> Preserve this activity in the investment history without assigning special behavior.</p>
              <p><strong>Ignore this activity:</strong> Do not import transactions with this source activity type.</p>
            </div>

            {hasUnmappedEvents && <p className="text-sm text-red-500">Please resolve highlighted event mappings to continue.</p>}
            <Button onClick={confirmEventTypes} disabled={hasUnmappedEvents}>Confirm Events</Button>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Select Target Account</h3>
            <p className="text-sm text-muted-foreground">
              Choose the FinancialManagement account that represents this brokerage account. Imported investment activity will be associated with this account.
            </p>
            
            <select className="w-full p-2 border rounded-md bg-background text-foreground border-input" value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
              <option value="">Select Account</option>
              {localAccounts.map(a => {
                const isActiveLink = a.isBankConnected || (a.externalMappings && a.externalMappings.some((m: any) => !m.disconnectedAt));
                return (
                  <option key={a.id} value={a.id} disabled={isActiveLink}>
                    {a.name} ({a.currency}) {isActiveLink ? "(Accounts connected through Open Banking cannot be used as broker import targets)" : ""}
                  </option>
                );
              })}
            </select>

            {!isCreatingAccount ? (
              <Button variant="outline" size="sm" onClick={() => setIsCreatingAccount(true)}>
                + Create New Account
              </Button>
            ) : (
              <div className="p-4 border rounded bg-muted/20 space-y-3 mt-2">
                <h4 className="font-semibold text-sm">Create New Account</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Name</label>
                    <Input value={newAccName} onChange={e => setNewAccName(e.target.value)} placeholder="e.g. My Broker Account" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Type</label>
                    <select className="w-full p-2 border rounded-md h-9 text-sm bg-background text-foreground border-input" value={newAccType} onChange={e => setNewAccType(e.target.value)}>
                      <option value="Broker">Broker</option>
                      <option value="Bank">Bank</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Currency</label>
                    <Input value={newAccCurrency} onChange={e => setNewAccCurrency(e.target.value)} placeholder="e.g. EUR" />
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button 
                    size="sm"
                    disabled={isPending || !newAccName}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await createAccount({ name: newAccName, type: newAccType as any, currency: newAccCurrency.toUpperCase(), balance: 0 });
                        if (res?.data?.account) {
                          const created = res.data.account;
                          setLocalAccounts(current => 
                            current.some(a => a.id === created.id) ? current : [...current, created]
                          );
                          setSelectedAccountId(created.id);
                          setIsCreatingAccount(false);
                          setNewAccName("");
                        }
                      });
                    }}
                  >
                    Create Account
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsCreatingAccount(false)}>Cancel</Button>
                </div>
              </div>
            )}

            <Button onClick={proceedToReview} disabled={!selectedAccountId}>Review Transactions</Button>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
             <h3 className="font-semibold">Review Transactions</h3>
             <p className="text-sm text-muted-foreground">
               Review the investment activity that will be added to your historical investment ledger.<br/>
               This import does not change current portfolio quantities or market values yet.
             </p>
             
             <div className="flex gap-4 text-sm bg-muted/20 p-3 rounded-md border">
                <div><strong>Source rows:</strong> {transactions.length}</div>
                <div className="text-emerald-600"><strong>Ready to import:</strong> {readyCount}</div>
                <div className="text-amber-600"><strong>Duplicates:</strong> {duplicateCount}</div>
                <div className="text-muted-foreground"><strong>Ignored:</strong> {ignoredCount}</div>
                <div className="text-red-500"><strong>Invalid:</strong> {invalidCount}</div>
             </div>

             <div className="max-h-[500px] overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 text-left">Import</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Activity</th>
                    <th className="p-2 text-left">Investment</th>
                    <th className="p-2 text-left">Identifier</th>
                    <th className="p-2 text-right">Quantity</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-left">Currency</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => {
                    const isInvalid = !tx.valid && tx.eventType !== "IGNORE";
                    const friendlyActivity = getFriendlyActivityLabel(tx.eventType, tx.rawEventType);
                    
                    let statusLabel = "Ready";
                    if (tx.eventType === "IGNORE") statusLabel = "Ignored";
                    else if (isInvalid) statusLabel = "Invalid";
                    else if (tx.isProbableDuplicate) statusLabel = "Duplicate";

                     return (
                       <tr key={tx.candidateIndex ?? idx} className={`border-b ${isInvalid ? 'bg-red-50 dark:bg-red-900/20' : ''} ${tx.isProbableDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : ''} ${tx.eventType === "IGNORE" ? 'opacity-50' : ''}`}>
                         <td className="p-2">
                           <input type="checkbox" checked={tx.import} disabled={!tx.valid || tx.eventType === "IGNORE"} onChange={e => {
                             const newTxs = [...transactions];
                             newTxs[idx].import = e.target.checked;
                             setTransactions(newTxs);
                           }} />
                         </td>
                         <td className="p-2 whitespace-nowrap">{tx.occurredAt}</td>
                         <td className="p-2">{friendlyActivity}</td>
                         <td className="p-2">{tx.instrumentName || ""}</td>
                         <td className="p-2 text-xs font-mono">{tx.isin || tx.ticker || tx.instrumentIdentifier || ""}</td>
                         <td className="p-2 text-right">{tx.quantity !== null ? tx.quantity : ""}</td>
                         <td className="p-2 text-right">{tx.unitPrice !== null ? tx.unitPrice : ""}</td>
                         <td className="p-2 text-right">{tx.amount !== null ? tx.amount : ""}</td>
                         <td className="p-2">{tx.currency || ""}</td>
                         <td className="p-2 text-xs">
                            {statusLabel === "Ready" && <span className="text-emerald-600">Will be added to your investment history.</span>}
                            {statusLabel === "Duplicate" && <span className="text-amber-600">Already imported and will be skipped.</span>}
                            {statusLabel === "Ignored" && <span className="text-muted-foreground">Excluded based on your event mapping.</span>}
                            {statusLabel === "Invalid" && <span className="text-red-500">Missing information required to safely import this event.</span>}
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
              </div>
              
              {isBalanceSafe && computedBalance !== null ? (
                <div className="flex flex-col space-y-2 mt-4 p-4 border rounded bg-muted/10">
                  <div className="text-sm">Current account cash balance: <strong>{currentAccountBalance} {accountCurrency}</strong></div>
                  <div className="text-sm">Calculated cash balance: <strong>{computedBalance} {accountCurrency}</strong></div>
                  
                  <div className="flex items-center space-x-2 mt-2 pt-2 border-t border-border">
                    <input
                      type="checkbox"
                      id="update-balance-checkbox"
                      checked={updateCashBalance}
                      onChange={(e) => setUpdateCashBalance(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary"
                    />
                    <label htmlFor="update-balance-checkbox" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Replace current account cash balance with {computedBalance} {accountCurrency}
                    </label>
                  </div>
                </div>
              ) : (
                <div className="mt-4 p-4 border rounded bg-amber-50 dark:bg-amber-900/10">
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    FinancialManagement could not reliably calculate a cash balance from this activity. Your account balance will not be changed.
                  </div>
                </div>
              )}
              
              <Button 
                onClick={handleImport} 
                disabled={isPending || status === "Checking for duplicates..." || (readyCount === 0 && (!updateCashBalance || !isBalanceSafe || computedBalance === null))}
              >
                {readyCount === 0 && updateCashBalance ? "Update Cash Balance" : "Import"}
              </Button>
           </div>
         )}
 
         {step === 7 && <div className="text-center"><h3 className="font-bold">Importing...</h3></div>}
 
         {step === 8 && summary && (
           <div className="text-center space-y-4">
             <ShieldCheck className="mx-auto h-12 w-12 text-emerald-500" />
             <h3 className="font-bold">Import Complete</h3>
             <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your broker activity has been processed. Current portfolio values are not updated by this import yet.
             </p>
             <div className="flex flex-col justify-center gap-2 mt-4 mb-6 text-sm">
               {summary.imported > 0 || summary.skipped === 0 ? (
                 <div className="text-emerald-600 font-bold">{summary.imported} investment activities imported.</div>
               ) : (
                 <div className="font-bold">0 new investment activities.</div>
               )}
               {summary.skipped > 0 && <div className="text-amber-600">{summary.skipped} duplicates skipped.</div>}
               
               {summary.balanceUpdated ? (
                 <div className="text-blue-600 font-bold mt-2">Account cash balance updated to {summary.resultingBalance} {accountCurrency}.</div>
               ) : (
                 <div className="text-muted-foreground mt-2">Account cash balance was left unchanged.</div>
               )}
             </div>
             <div className="flex justify-center gap-4">
               <Button onClick={() => window.location.href = "/investments?tab=activity"}>View investment activity</Button>
               <Button variant="outline" onClick={() => window.location.reload()}>Finish</Button>
             </div>
           </div>
         )}
       </CardContent>
     </Card>
   );
 }

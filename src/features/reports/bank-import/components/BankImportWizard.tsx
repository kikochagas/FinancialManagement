"use client";

import React, { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { getSheetData, determineBestSheet, normalizeHeader } from "../workbook";
import { detectHeaderRow } from "../header-detection";
import { orchestrateColumnMapping } from "../parser";
import { BankStatementAIMapper } from "../ai-column-mapper";
import { sampleColumnShapes } from "../shape-inference";
import { ColumnMapping, ParsedBankTransaction, AISanitizedColumnInfo } from "../types";
import { buildTransactions } from "../transaction-builder";
import { validateTransaction } from "../validation";
import { parseMoneyStrict } from "../money-parser";
import { buildImportPayload } from "../payload-builder";
import { importBankStatementAction, mapBankStatementColumnsWithAIAction, previewBankStatementDuplicatesAction } from "../actions";
import { createAccount } from "@/features/accounts/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileUp, ShieldCheck, AlertTriangle } from "lucide-react";

export function BankImportWizard({ accounts, categories }: { accounts: any[], categories: any[] }) {
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [step, setStep] = useState(1);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [fileData, setFileData] = useState<any[][] | null>(null);
  
  const [headerRowIdx, setHeaderRowIdx] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Record<number, ColumnMapping>>({});
  
  const [transactions, setTransactions] = useState<(ParsedBankTransaction & { import: boolean, categoryId?: string })[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [updateBalance, setUpdateBalance] = useState<boolean>(false);
  const [endingBalance, setEndingBalance] = useState<number | null>(null);
  
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [statementCurrency, setStatementCurrency] = useState<string | null>(null);
  const [statementCurrencyStatus, setStatementCurrencyStatus] = useState<string>("unknown");
  const [headerInputRaw, setHeaderInputRaw] = useState<string>("");

  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState("Bank");
  const [newAccCurrency, setNewAccCurrency] = useState("EUR");

  const [isPending, startTransition] = useTransition();

  // Step 1: Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Reading file...");
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        setWorkbook(wb);
        
        // Find best sheet
        let bestSheet = wb.SheetNames[0];
        let maxScore = -1;
        let plausibleSheets = 0;
        
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const data = getSheetData(ws);
          let score = 0;
          for (let i = 0; i < Math.min(data.length, 100); i++) {
            if (data[i] && data[i].filter((c: any) => c !== "").length >= 3) score++;
          }
          if (score > 0) plausibleSheets++;
          if (score > maxScore) {
            maxScore = score;
            bestSheet = sheetName;
          }
        }

        if (plausibleSheets <= 1 && maxScore > 0) {
          // Auto load
          loadSheet(bestSheet, wb);
        } else {
          // Require manual selection
          setSelectedSheet("");
        }
        
        setStatus("");
        setStep(2); // Sheet Selection / Header Detect
      } catch (err) {
        setStatus("Error reading file.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const loadSheet = (sheetName: string, wb: XLSX.WorkBook) => {
    setSelectedSheet(sheetName);
    const ws = wb.Sheets[sheetName];
    const rows = getSheetData(ws);
    setFileData(rows);
    
    const { headerRowIndex } = detectHeaderRow(rows);
    setHeaderRowIdx(headerRowIndex);
  };

  // Step 2: Sheet & Header Detection
  const handleSelectSheet = (sheetName: string) => {
    if (!workbook) return;
    loadSheet(sheetName, workbook);
  };

  const proceedToMapping = async () => {
    if (!fileData || headerRowIdx === null) return;
    setStatus("Analyzing columns...");
    
    const headers = fileData[headerRowIdx];
    
    // We orchestrate deterministic mapping
    // AI call moved to Server Action if needed
    const aiMapper = new BankStatementAIMapper(
      // Mock Provider that calls our Server Action
      {
        generateStructured: async (req: any) => {
          // The Server Action handles AI safely
          const cols = JSON.parse(req.userPrompt).columns;
          const res = await mapBankStatementColumnsWithAIAction({ columns: cols });
          if (res?.data?.success) {
            return res.data.result as any;
          }
          throw new Error("AI_MAPPING_UNAVAILABLE");
        }
      }
    );
    
    const { mapping: newMapping, aiUsed, warnings } = await orchestrateColumnMapping(headers, fileData, aiMapper, headerRowIdx);
    
    setMapping(newMapping);
    setStatus(aiUsed ? "AI assisted mapping." : "Deterministic mapping.");
    setStep(3); // Column Mapping
  };

  // Step 3: Column Mapping
  const handleMappingChange = (index: number, newSemantic: string) => {
    setMapping(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        semantic: newSemantic as any,
        source: "user" // User override
      }
    }));
  };

  const proceedToAccount = () => {
    if (!fileData || headerRowIdx === null) return;
    const { transactions: txs, endingBalance: detectedBalance, footerRowsSkipped, blankRowsIgnored, statementCurrencyStatus: currStatus, statementCurrency: curr } = buildTransactions(fileData, headerRowIdx, mapping);
    
    setStatementCurrencyStatus(currStatus);
    setStatementCurrency(curr);

    setTransactions(txs.map(t => ({ ...t, import: t.valid })));
    setEndingBalance(detectedBalance);
    setSummary((prev: any) => ({ ...prev, footerRowsSkipped, blankRowsIgnored }));
    setStep(4);
  };

  const proceedToReview = async () => {
    if (!selectedAccountId) return;
    setStatus("Checking for duplicates...");
    setStep(5);
    
    // Server action preview: only send valid candidates
    const validCandidates = transactions.map((t, idx) => ({ t, idx })).filter(({ t }) => t.valid);

    try {
      const res = await previewBankStatementDuplicatesAction({
        accountId: selectedAccountId,
        transactions: validCandidates.map(({ t, idx }) => ({
          candidateIndex: idx,
          bookingDate: t.bookingDate!,
          description: t.description,
          amount: t.amount!,
          direction: t.direction as "Debit" | "Credit"
        }))
      });
      
      if (res?.data?.success) {
        const duplicates = res.data.duplicateIndices;
        const categoriesMap = res.data.categories;
        setTransactions(prev => prev.map((t, i) => {
          let updated = { ...t };
          if (duplicates.includes(i)) {
            updated = { ...updated, isProbableDuplicate: true, import: false };
          }
          if (categoriesMap && categoriesMap[i] && !updated.categoryId) {
            updated.categoryId = categoriesMap[i];
            (updated as any).isCategorySuggested = true;
          }
          return updated;
        }));
      }
    } catch (err) {
      console.error(err);
    }
    setStatus("");
  };

  const revalidateRow = (idx: number, updates: Partial<typeof transactions[0]>) => {
    const newTxs = [...transactions];
    const tx = { ...newTxs[idx], ...updates };
    
    // Reset warnings
    tx.warnings = [];
    const validated = validateTransaction(tx);
    
    // Invalidate duplicate status if core identity fields changed
    let isProbableDuplicate = tx.isProbableDuplicate === true ? true : undefined;
    if (
      updates.bookingDate !== undefined || 
      updates.description !== undefined || 
      updates.amount !== undefined || 
      updates.direction !== undefined
    ) {
      isProbableDuplicate = false;
    }

    newTxs[idx] = { 
      ...validated, 
      import: tx.import, 
      categoryId: tx.categoryId, 
      isProbableDuplicate 
    };
    setTransactions(newTxs);
  };

  // Step 4: Account Target
  // Step 5: Review
  // Step 6: Import
  const handleImport = () => {
    setStep(6);
    setStatus("Importing transactions...");
    startTransition(async () => {
      const payload = buildImportPayload(selectedAccountId, updateBalance, endingBalance, transactions);
      const toImportCount = payload.transactions.length;

      const res = await importBankStatementAction(payload);

      if (res?.data?.success) {
        const candidateTransactions = transactions.length;
        const unresolvedInvalidRows = transactions.filter(t => !t.valid).length;
        const probableDuplicatesExcludedByPreview = transactions.filter(t => t.valid && t.isProbableDuplicate && !t.import).length;
        const excludedByUser = transactions.filter(t => t.valid && !t.isProbableDuplicate && !t.import).length;
        const requestedForImport = toImportCount;

        setSummary((prev: any) => ({
          ...prev,
          candidateTransactions,
          unresolvedInvalidRows,
          probableDuplicatesExcludedByPreview,
          excludedByUser,
          requestedForImport,
          imported: res.data!.insertedCount,
          probableDuplicatesSkippedByServer: res.data!.probableDuplicatesSkipped,
          balanceUpdated: updateBalance
        }));
        setStep(7);
      } else {
        setStatus(`Import failed: ${res?.serverError}`);
        setStep(5); // Go back to review on failure
      }
    });
  };

  return (
    <Card className="w-full mt-4">
      <CardHeader>
        <CardTitle>Bank Statement Import</CardTitle>
        <CardDescription>Step {step} of 7</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && <div className="p-3 bg-muted text-sm rounded-md mb-4">{status}</div>}
        
        {step === 1 && (
          <div className="flex items-center justify-center border-2 border-dashed border-border rounded-lg p-6 bg-muted/20 hover:border-muted-foreground/50 transition-colors">
            <div className="text-center space-y-2">
              <FileUp className="h-8 w-8 text-muted-foreground mx-auto" />
              <div className="text-xs">
                <label className="cursor-pointer text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:underline">
                  Upload spreadsheet file
                  <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground">Excel multi-sheet mapping supported.</p>
            </div>
          </div>
        )}

        {step === 2 && workbook && (
          <div className="space-y-4">
            <h3 className="font-semibold">Select Sheet & Header</h3>
            <select className="border p-2 rounded" value={selectedSheet} onChange={e => handleSelectSheet(e.target.value)}>
              {workbook.SheetNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            
            {headerRowIdx !== null ? (
              <p className="text-sm text-muted-foreground">Detected headers on row {headerRowIdx + 1}</p>
            ) : (
              <div>
                <p className="text-sm text-red-500 mb-2">Could not confidently identify the header row.</p>
                <label className="text-sm">Transaction headers start on row (1-indexed):</label>
                <Input type="number" min={1} value={headerInputRaw} onChange={e => {
                  setHeaderInputRaw(e.target.value);
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= fileData!.length && fileData![val - 1]) {
                    const rowData = fileData![val - 1];
                    const validCellCount = rowData.filter((c: any) => typeof c === 'string' && c.trim() !== '').length;
                    if (validCellCount >= 3) {
                      setHeaderRowIdx(val - 1);
                    } else {
                      setHeaderRowIdx(null);
                    }
                  } else {
                    setHeaderRowIdx(null);
                  }
                }} />
                {headerInputRaw !== "" && headerRowIdx === null && (
                  <div className="text-red-500 text-xs mt-1">Invalid row number or insufficient header columns (requires at least 3 non-empty cells).</div>
                )}
              </div>
            )}
            
            <Button onClick={proceedToMapping} disabled={!selectedSheet || headerRowIdx === null}>Continue</Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Column Mapping</h3>
            <div className="space-y-2">
              {Object.values(mapping).map((m, i) => (
                <div key={i} className="flex justify-between items-center border-b pb-2 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{m.header}</span>
                    <span className="text-xs text-muted-foreground ml-2">({m.source} {(m.confidence * 100).toFixed(0)}%)</span>
                  </div>
                  <select 
                    className="border rounded p-1 w-48"
                    value={m.semantic || "UNMAPPED"}
                    onChange={(e) => handleMappingChange(m.columnIndex, e.target.value)}
                  >
                    <option value="UNMAPPED">-- Unmapped --</option>
                    <option value="IGNORE">Ignore</option>
                    <option value="BOOKING_DATE">Booking Date</option>
                    <option value="VALUE_DATE">Value Date</option>
                    <option value="DESCRIPTION">Description</option>
                    <option value="AMOUNT">Amount (Signed)</option>
                    <option value="DEBIT">Debit</option>
                    <option value="CREDIT">Credit</option>
                    <option value="TYPE">Type</option>
                    <option value="BALANCE_AFTER">Balance After</option>
                    <option value="CURRENCY">Currency</option>
                    <option value="COUNTERPARTY">Counterparty</option>
                    <option value="PAYER">Payer</option>
                    <option value="BENEFICIARY">Beneficiary</option>
                    <option value="IBAN">IBAN</option>
                    <option value="REFERENCE">Reference</option>
                  </select>
                </div>
              ))}
            </div>
            {(() => {
              const sems = Object.values(mapping).map(m => m.semantic).filter(Boolean);
              const counts: Record<string, number> = {};
              sems.forEach(s => counts[s as string] = (counts[s as string] || 0) + 1);
              const hasCollision = Object.entries(counts).some(([sem, count]) => count > 1 && !["IGNORE", "UNMAPPED"].includes(sem));
              const missingReq = !counts["BOOKING_DATE"] || !counts["DESCRIPTION"] || (!counts["AMOUNT"] && !(counts["DEBIT"] && counts["CREDIT"]));
              
              if (hasCollision) return <div className="text-red-500 text-sm">Please resolve mapping collisions (duplicate semantics) before continuing.</div>;
              if (missingReq) return <div className="text-red-500 text-sm">Missing required mappings: Booking Date, Description, and Amount (or Debit/Credit).</div>;
              return <Button onClick={proceedToAccount}>Confirm Mappings</Button>;
            })()}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
             <h3 className="font-semibold">Select Target Account</h3>
             <select className="w-full p-2 border rounded-md" value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                 <option value="">Select Account</option>
                {localAccounts.map((a) => {
                  const isActiveLink = a.isBankConnected || (a.externalMappings && a.externalMappings.some((m: any) => !m.disconnectedAt));
                  return (
                    <option key={a.id} value={a.id} disabled={isActiveLink}>
                      {a.name} ({a.balance}) {isActiveLink ? "(Currently synchronized via Open Banking)" : ""}
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
                      <Input value={newAccName} onChange={e => setNewAccName(e.target.value)} placeholder="e.g. My Savings" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">Type</label>
                      <select className="w-full p-2 border rounded-md h-9 text-sm" value={newAccType} onChange={e => setNewAccType(e.target.value)}>
                        <option value="Bank">Bank</option>
                        <option value="Credit Card">Credit Card</option>
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
                          if (res?.data?.success) {
                            setLocalAccounts([...localAccounts, res.data.account]);
                            setSelectedAccountId(res.data.account.id);
                            setIsCreatingAccount(false);
                            setNewAccName("");
                          }
                        });
                      }}
                    >
                      Save Account
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setIsCreatingAccount(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {endingBalance !== null && (
                <div className="mt-4 p-4 border rounded bg-muted/30 space-y-2">
                  <p className="text-sm font-medium">Statement Ending Balance detected: {endingBalance.toFixed(2)} {statementCurrency || (selectedAccountId && localAccounts.find(a => a.id === selectedAccountId)?.currency) || 'EUR'}</p>
                  <label className="flex items-center space-x-2 text-sm">
                    <input type="checkbox" checked={updateBalance} onChange={e => setUpdateBalance(e.target.checked)} />
                    <span>Update account balance to exactly match this statement ending balance.</span>
                  </label>
                </div>
              )}

              {endingBalance === null && (
                <div className="mt-4 p-4 border rounded bg-red-50/50 space-y-2">
                  <p className="text-sm font-medium text-red-600">Statement ending balance could not be determined confidently.</p>
                </div>
              )}

              {statementCurrencyStatus === "ambiguous" && (
                <div className="mt-4 p-4 border rounded bg-red-50/50 space-y-2">
                  <p className="text-sm font-medium text-red-600">This statement contains multiple currencies. Multi-currency statement import is not supported yet.</p>
                </div>
              )}

              {statementCurrencyStatus === "detected" && statementCurrency && selectedAccountId && (
                (() => {
                  const selAcc = localAccounts.find(a => a.id === selectedAccountId);
                  if (selAcc && selAcc.currency.toUpperCase() !== statementCurrency.toUpperCase()) {
                    return (
                      <div className="mt-4 p-4 border rounded bg-red-50/50 space-y-2">
                        <p className="text-sm font-medium text-red-600">Statement currency ({statementCurrency}) does not match the selected account ({selAcc.currency}).</p>
                      </div>
                    );
                  }
                  return null;
                })()
              )}

              <Button 
                onClick={proceedToReview} 
                disabled={
                  Boolean(!selectedAccountId) || 
                  statementCurrencyStatus === "ambiguous" ||
                  Boolean(statementCurrencyStatus === "detected" && statementCurrency && selectedAccountId && localAccounts.find(a => a.id === selectedAccountId)?.currency.toUpperCase() !== statementCurrency.toUpperCase())
                }
              >
                Review Transactions
              </Button>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Review Transactions</h3>
            <p className="text-sm text-muted-foreground">{transactions.filter(t => t.import && t.valid).length} ready to import.</p>
            
            <div className="max-h-[500px] overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Import</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-left">Direction</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-left">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => (
                    <tr key={idx} className={`border-b ${!tx.valid ? 'bg-red-50/50' : ''} ${tx.isProbableDuplicate ? 'bg-orange-50/30' : ''}`}>
                      <td className="p-2">
                        <input 
                          type="checkbox" 
                          checked={tx.import} 
                          disabled={!tx.valid}
                          onChange={(e) => revalidateRow(idx, { import: e.target.checked })} 
                        />
                        {!!tx.isProbableDuplicate && <span className="text-[10px] bg-orange-200 text-orange-800 px-1 ml-2 rounded">Probable duplicate</span>}
                      </td>
                      <td className="p-2">
                        <Input 
                          className="h-7 text-xs w-24" 
                          value={tx.bookingDate || ""} 
                          onChange={(e) => revalidateRow(idx, { bookingDate: e.target.value })} 
                        />
                      </td>
                      <td className="p-2">
                        <Input 
                          className="h-7 text-xs" 
                          value={tx.description} 
                          onChange={(e) => revalidateRow(idx, { description: e.target.value })} 
                        />
                        {tx.warnings.length > 0 && <div className="text-[10px] text-red-500 mt-1">{tx.warnings.join(", ")}</div>}
                      </td>
                      <td className="p-2">
                         <select 
                          className="border rounded p-1 text-xs"
                          value={tx.direction || ""}
                          onChange={(e) => revalidateRow(idx, { direction: e.target.value as "Credit"|"Debit" })}
                         >
                           <option value="">--</option>
                           <option value="Credit">Credit (+)</option>
                           <option value="Debit">Debit (-)</option>
                         </select>
                      </td>
                      <td className="p-2 text-right">
                        <Input 
                          className="h-7 text-xs w-20 text-right ml-auto" 
                          value={tx.amount !== null ? tx.amount.toString() : ""} 
                          onChange={(e) => {
                            const res = parseMoneyStrict(e.target.value);
                            revalidateRow(idx, { amount: res.value });
                          }} 
                        />
                      </td>
                      <td className="p-2">
                         <div className="flex flex-col gap-1">
                           <select 
                            className="border rounded p-1 text-xs w-24"
                            value={tx.categoryId || ""}
                            onChange={(e) => revalidateRow(idx, { categoryId: e.target.value || undefined, isCategorySuggested: false } as any)}
                           >
                             {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                           </select>
                           {(tx as any).isCategorySuggested && (
                             <span className="text-[10px] text-violet-500 font-medium">Suggested</span>
                           )}
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button onClick={handleImport} disabled={isPending || transactions.filter(t => t.import && t.valid).length === 0}>
              Confirm & Import
            </Button>
          </div>
        )}

        {step === 6 && (
          <div className="text-center space-y-4">
            <h3 className="font-bold text-lg">Importing...</h3>
            <p className="text-sm">Please wait while your transactions are being imported.</p>
          </div>
        )}

        {step === 7 && summary && (
          <div className="text-center space-y-4">
            <ShieldCheck className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="font-bold text-lg">Import Complete</h3>
            <p className="text-sm text-muted-foreground">Candidate Transactions: {summary.candidateTransactions}</p>
            <p className="text-sm text-muted-foreground">Blank Rows Ignored: {summary.blankRowsIgnored}</p>
            <p className="text-sm text-muted-foreground">Footer Rows Skipped: {summary.footerRowsSkipped}</p>
            <p className="text-sm text-amber-600">Unresolved Invalid Rows: {summary.unresolvedInvalidRows}</p>
            <p className="text-sm text-amber-600">Probable Duplicates Excluded By Preview: {summary.probableDuplicatesExcludedByPreview}</p>
            <p className="text-sm text-amber-600">Excluded By User: {summary.excludedByUser}</p>
            <p className="text-sm font-medium">Requested For Import: {summary.requestedForImport}</p>
            <p className="text-sm text-amber-600">Probable Duplicates Skipped By Server: {summary.probableDuplicatesSkippedByServer}</p>
            <p className="text-sm font-semibold text-emerald-600">Imported: {summary.imported}</p>
            <p className="text-sm">Balance Updated: {summary.balanceUpdated ? "Yes" : "No"}</p>
            <Button onClick={() => window.location.reload()}>Finish</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import React, { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importDataAction } from "./actions";
import { formatCurrency } from "@/lib/utils";
import * as XLSX from "xlsx";
import { FileDown, FileUp, Calculator, ShieldCheck, Printer, FileText, CheckCircle2 } from "lucide-react";
import { parseStructuredImport } from "./structured-import-parser";
import { BankImportWizard } from "./bank-import/components/BankImportWizard";

interface ReportsClientProps {
  data: {
    transactions: any[];
    accounts: {
      id: string;
      name: string;
      type: string;
      balance: number;
      currency: string;
      isBankConnected: boolean;
    }[];
    categories: {
      id: string;
      name: string;
    }[];
    investments: any[];
    goals: any[];
    taxReservation: {
      year: number;
      estimatedTaxLiability: number;
      taxWithheld: number;
      notes: string;
    };
  };
}

export function ReportsClient({ data }: ReportsClientProps) {
  const [isPending, startTransition] = useTransition();

  // Excel Import Preview state
  const [importedPreview, setImportedPreview] = useState<{
    transactions?: any[];
    accounts?: any[];
    investments?: any[];
    goals?: any[];
    snapshots?: any[];
  } | null>(null);

  const [importStatus, setImportStatus] = useState<string>("");

  // Portuguese IRS Calculator state
  const [salaryIncome, setSalaryIncome] = useState<number>(4500 * 14); // e.g. 4500 monthly salary * 14 months (standard Portuguese contract)
  const [capitalGains, setCapitalGains] = useState<number>(850 - 800 + (1000 - 900)); // stocks + btc profit (150€)
  const [deductions, setDeductions] = useState<number>(4104); // standard deduction (dedução específica)

  // Parse Excel / CSV File
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus("Parsing file...");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as string;
        const result = parseStructuredImport({ buffer, fileName: file.name });

        if (result.transactions || result.accounts || result.investments || result.goals || result.snapshots) {
          setImportedPreview(result);
          setImportStatus("Mapping completed. Preview loaded below.");
        } else {
          setImportStatus("Failed to map sheets. Ensure headers contain amount/description (or valor/descrição) for transactions.");
        }
      } catch (err) {
        console.error(err);
        setImportStatus("Error parsing file.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // Submit Bulk Import
  const triggerImportSave = () => {
    if (!importedPreview) return;
    startTransition(async () => {
      const res = await importDataAction({
        importMode: (importedPreview as any).importMode || "TransactionsOnly",
        transactions: importedPreview.transactions,
        accounts: importedPreview.accounts,
        investments: importedPreview.investments,
        goals: importedPreview.goals,
        snapshots: importedPreview.snapshots,
      });
      if (res?.data?.success) {
        setImportedPreview(null);
        setImportStatus("Data imported successfully!");
      } else {
        console.error(res);
        setImportStatus("Import failed: " + JSON.stringify(res?.serverError || res?.validationErrors || res));
      }
    });
  };

  // Export to Excel Workbook
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Metadata Sheet (FormatVersion 2)
    const wsMetadata = XLSX.utils.json_to_sheet([{ FormatVersion: 2 }]);
    XLSX.utils.book_append_sheet(wb, wsMetadata, "Metadata");

    // Accounts Sheet
    const wsAccounts = XLSX.utils.json_to_sheet(data.accounts);
    XLSX.utils.book_append_sheet(wb, wsAccounts, "Accounts");

    // Transactions Sheet
    const exportTransactions = data.transactions.map((t) => ({
      Date: t.date,
      Description: t.description,
      Direction: t.direction,
      Amount: t.amount,
      Account: t.accountName,
      DestinationAccount: t.destinationAccountName || "",
      Category: t.categoryName,
      Tags: t.tags,
      Notes: t.notes,
    }));
    const wsTransactions = XLSX.utils.json_to_sheet(exportTransactions);
    XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions");

    // Investments Sheet
    const wsInvestments = XLSX.utils.json_to_sheet(data.investments);
    XLSX.utils.book_append_sheet(wb, wsInvestments, "Investments");

    // Goals Sheet
    const wsGoals = XLSX.utils.json_to_sheet(data.goals);
    XLSX.utils.book_append_sheet(wb, wsGoals, "Goals");

    // Trigger download
    XLSX.writeFile(wb, "Wealth_Report_FinancialManagement.xlsx");
  };

  // Export Transactions to CSV
  const handleExportCSV = () => {
    if (data.transactions.length === 0) return;
    const headers = ["Date", "Description", "Direction", "Amount", "Account", "DestinationAccount", "Category", "Tags", "Notes"];
    const csvContent = [
      headers.join(","),
      ...data.transactions.map((t) =>
        [
          t.date,
          `"${t.description.replace(/"/g, '""')}"`,
          t.direction,
          t.amount,
          t.accountName,
          t.destinationAccountName || "",
          t.categoryName,
          `"${t.tags}"`,
          `"${(t.notes || "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "transactions_export.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print PDF Trigger
  const handlePrintPDF = () => {
    window.print();
  };

  // Simple Portuguese IRS Liability Calculator
  // Portuguese IRS progressive rules have standard deduction of 4104€
  // Capital gains flat rate is 28% for stocks/crypto
  const simulateIRS = () => {
    const taxableSalary = Math.max(0, salaryIncome - deductions);
    // Simple 2026 progressive bracket estimation (average rate estimation e.g. 28.5%)
    let progressiveTaxRate = 0.285;
    if (taxableSalary < 20000) progressiveTaxRate = 0.18;
    else if (taxableSalary < 40000) progressiveTaxRate = 0.25;
    else if (taxableSalary < 80000) progressiveTaxRate = 0.35;
    else progressiveTaxRate = 0.45;

    const salaryTax = taxableSalary * progressiveTaxRate;
    const gainsTax = capitalGains * 0.28; // 28% flat rate for securities/investments
    const totalTax = salaryTax + gainsTax;

    return {
      taxableSalary,
      salaryTax,
      gainsTax,
      totalTax,
      withheld: data.taxReservation.taxWithheld,
      netRemaining: Math.max(0, totalTax - data.taxReservation.taxWithheld),
    };
  };

  const irsResult = simulateIRS();

  return (
    <div className="space-y-8 pb-10 print:bg-white print:text-black">
      {/* Print PDF Style Wrapper */}
      <div className="hidden print:block mb-8">
        <h1 className="text-3xl font-extrabold text-foreground border-b pb-4 border-border">Financial Cockpit Annual Report</h1>
        <p className="text-sm text-muted-foreground mt-2">Generated by FinancialManagement Dashboard.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 print:grid-cols-1">
        {/* Portuguese IRS simulator */}
        <Card className="hidden border-border bg-card/50 shadow-sm print:border-none print:shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground flex items-center gap-2">
              <Calculator className="h-4 w-4 text-violet-500 dark:text-violet-400" /> Portuguese IRS Simulation
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Estimate tax liability using standard Portuguese progressive brackets and flat rates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">Annual Salary Income (€)</label>
                <Input
                  type="number"
                  value={salaryIncome}
                  onChange={(e) => setSalaryIncome(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">Capital Gains Profit (€)</label>
                <Input
                  type="number"
                  value={capitalGains}
                  onChange={(e) => setCapitalGains(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg border border-border space-y-3">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Taxable Salary base (after €{deductions} deduction)</span>
                <span>{formatCurrency(irsResult.taxableSalary)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Salary progressive IRS liability (bracket estimate)</span>
                <span>{formatCurrency(irsResult.salaryTax)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Capital gains flat tax liability (28% rate)</span>
                <span>{formatCurrency(irsResult.gainsTax)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold text-sm text-foreground">
                <span>Total simulated tax liability</span>
                <span>{formatCurrency(irsResult.totalTax)}</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Year-to-date withheld IRS tax</span>
                <span>-{formatCurrency(irsResult.withheld)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-extrabold text-base text-violet-600 dark:text-violet-400">
                <span>IRS outstanding balance (to pay)</span>
                <span>{formatCurrency(irsResult.netRemaining)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Flat tax of 28% applied to stocks and crypto profits. Income subject to Portuguese IRS declaration rules.</span>
            </div>
          </CardContent>
        </Card>

        {/* Data imports & exports */}
        <Card className="border-border bg-card/50 shadow-sm print:hidden">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground flex items-center gap-2">
              <FileDown className="h-4 w-4 text-violet-500 dark:text-violet-400" /> Excel / CSV Data Operations
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Backup wealth sheets or restore database states from spreadsheets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Export block */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Export Backups</span>
              <div className="grid grid-cols-2 gap-4">
                <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={handleExportExcel}>
                  <FileText className="h-4 w-4 text-green-500" />
                  Excel Workbook
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={handleExportCSV}>
                  <FileText className="h-4 w-4 text-blue-500" />
                  Transactions CSV
                </Button>
              </div>
            </div>

            {/* Import block */}
            <div className="space-y-3 pt-2 border-t border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Import spreadsheets (Excel / CSV)</span>
              <div className="flex items-center justify-center border-2 border-dashed border-border rounded-lg p-6 bg-muted/20 hover:border-muted-foreground/50 transition-colors">
                <div className="text-center space-y-2">
                  <FileUp className="h-8 w-8 text-muted-foreground mx-auto" />
                  <div className="text-xs">
                    <label className="cursor-pointer text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:underline">
                      Upload spreadsheet file
                      <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportFile} />
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Excel multi-sheet mapping supported.</p>
                </div>
              </div>

              {/* Status info */}
              {importStatus && (
                <div className="text-xs text-muted-foreground font-medium py-1.5 px-3 bg-muted border border-border rounded-lg">
                  {importStatus}
                </div>
              )}
            </div>
            
            <div className="pt-2 border-t border-border mt-4">
               <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Unstructured Bank Statement Import</span>
               <BankImportWizard accounts={data.accounts} categories={data.categories} />
            </div>

            {/* Print trigger */}
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Generate printable vector document</span>
              <Button size="sm" className="flex items-center gap-2" onClick={handlePrintPDF}>
                <Printer className="h-4 w-4" /> Print Wealth Statement
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import Preview panel */}
      {importedPreview && (
        <Card className="border-border bg-card/50 shadow-sm print:hidden animate-in fade-in-50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-card-foreground">Import mapping preview</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">Check parsed ledger rows before matching them in database.</CardDescription>
            </div>
            <Button size="sm" className="flex items-center gap-1.5" onClick={triggerImportSave} disabled={isPending}>
              <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
              {isPending ? "Importing..." : "Confirm Import"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {importedPreview.accounts && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Mapped Accounts ({importedPreview.accounts.length})</span>
                <div className="max-h-[140px] overflow-y-auto border border-border rounded-lg text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-muted text-muted-foreground font-semibold border-b border-border">
                        <th className="p-2">Name</th>
                        <th className="p-2">Type</th>
                        <th className="p-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importedPreview.accounts.map((acc, index) => (
                        <tr key={index}>
                          <td className="p-2 font-semibold text-foreground">{acc.name}</td>
                          <td className="p-2 text-muted-foreground">{acc.type}</td>
                          <td className="p-2 text-right font-mono font-bold text-foreground">{formatCurrency(acc.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importedPreview.transactions && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Mapped Transactions ({importedPreview.transactions.length})</span>
                <div className="max-h-[220px] overflow-y-auto border border-border rounded-lg text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-muted text-muted-foreground font-semibold border-b border-border">
                        <th className="p-2">Date</th>
                        <th className="p-2">Description</th>
                        <th className="p-2">Type</th>
                        <th className="p-2">Account</th>
                        <th className="p-2">Category</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importedPreview.transactions.map((tx, index) => (
                        <tr key={index}>
                          <td className="p-2 font-mono text-[10px] text-muted-foreground">{tx.date}</td>
                          <td className="p-2 font-semibold text-foreground">{tx.description}</td>
                          <td className="p-2 text-muted-foreground">{tx.direction}</td>
                          <td className="p-2 text-muted-foreground">{tx.accountName}</td>
                          <td className="p-2 text-violet-600 dark:text-violet-400">{tx.categoryName}</td>
                          <td className="p-2 text-right font-mono font-bold text-foreground">{formatCurrency(tx.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importedPreview.investments && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Mapped Investments ({importedPreview.investments.length})</span>
                <div className="max-h-[140px] overflow-y-auto border border-border rounded-lg text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-muted text-muted-foreground font-semibold border-b border-border">
                        <th className="p-2">Name</th>
                        <th className="p-2">Type</th>
                        <th className="p-2 text-right">Cost Basis</th>
                        <th className="p-2 text-right">Market Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importedPreview.investments.map((inv, index) => (
                        <tr key={index}>
                          <td className="p-2 font-semibold text-foreground">{inv.name}</td>
                          <td className="p-2 text-muted-foreground">{inv.type}</td>
                          <td className="p-2 text-right font-mono text-foreground">{formatCurrency(inv.costBasis)}</td>
                          <td className="p-2 text-right font-mono font-bold text-foreground">{formatCurrency(inv.marketValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importedPreview.goals && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Mapped Goals ({importedPreview.goals.length})</span>
                <div className="max-h-[140px] overflow-y-auto border border-border rounded-lg text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-muted text-muted-foreground font-semibold border-b border-border">
                        <th className="p-2">Name</th>
                        <th className="p-2">Type</th>
                        <th className="p-2 text-right">Target</th>
                        <th className="p-2 text-right">Current</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importedPreview.goals.map((g, index) => (
                        <tr key={index}>
                          <td className="p-2 font-semibold text-foreground">{g.name}</td>
                          <td className="p-2 text-muted-foreground">{g.type}</td>
                          <td className="p-2 text-right font-mono text-foreground">{formatCurrency(g.targetAmount)}</td>
                          <td className="p-2 text-right font-mono font-bold text-foreground">{formatCurrency(g.currentAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importedPreview.snapshots && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Mapped Snapshots ({importedPreview.snapshots.length})</span>
                <div className="max-h-[140px] overflow-y-auto border border-border rounded-lg text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-muted text-muted-foreground font-semibold border-b border-border">
                        <th className="p-2">Period</th>
                        <th className="p-2 text-right">Net Worth</th>
                        <th className="p-2 text-right">Liquid Assets</th>
                        <th className="p-2 text-right">Investments</th>
                        <th className="p-2 text-right">Savings Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importedPreview.snapshots.map((s, index) => (
                        <tr key={index}>
                          <td className="p-2 font-semibold text-foreground">{s.year}-{String(s.month).padStart(2, '0')}</td>
                          <td className="p-2 text-right font-mono text-foreground">{formatCurrency(s.netWorth)}</td>
                          <td className="p-2 text-right font-mono text-foreground">{formatCurrency(s.liquidAssets)}</td>
                          <td className="p-2 text-right font-mono text-foreground">{formatCurrency(s.investmentsValue)}</td>
                          <td className="p-2 text-right font-bold text-emerald-600">{s.savingsRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PDF Printable view - shown only on print */}
      <div className="hidden print:block space-y-6">
        <h2 className="text-xl font-bold text-foreground border-b border-border pb-2">Financial Portfolio Breakdown</h2>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-semibold text-muted-foreground">Asset Accounts</p>
            <ul className="mt-2 space-y-2">
              {data.accounts.map((a, i) => (
                <li key={i} className="flex justify-between border-b border-border pb-1">
                  <span>{a.name} ({a.type})</span>
                  <strong className="text-foreground">{formatCurrency(a.balance)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Long-term Investments</p>
            <ul className="mt-2 space-y-2">
              {data.investments.map((inv, i) => (
                <li key={i} className="flex justify-between border-b border-border pb-1">
                  <span>{inv.name} ({inv.type})</span>
                  <strong className="text-foreground">{formatCurrency(inv.marketValue)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <h2 className="text-xl font-bold text-foreground border-b border-border pb-2 pt-6">Aspirations & Goals</h2>
        <table className="w-full text-left text-sm mt-2 border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2">Goal Name</th>
              <th className="py-2">Type</th>
              <th className="py-2 text-right">Target</th>
              <th className="py-2 text-right">Current</th>
              <th className="py-2 text-right">Progress</th>
            </tr>
          </thead>
          <tbody>
            {data.goals.map((g, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2">{g.name}</td>
                <td className="py-2">{g.type}</td>
                <td className="py-2 text-right">{formatCurrency(g.targetAmount)}</td>
                <td className="py-2 text-right">{formatCurrency(g.currentAmount)}</td>
                <td className="py-2 text-right font-bold text-foreground">{g.progress.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

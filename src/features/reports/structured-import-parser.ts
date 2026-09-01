import * as XLSX from "xlsx";
import { parseNumber, parseDate, parseLegacyTransactionType } from "./utils";

export interface StructuredImportResult {
  formatVersion: number;
  importMode: "FullBackup" | "TransactionsOnly";
  accounts?: any[];
  transactions?: any[];
  investments?: any[];
  goals?: any[];
  snapshots?: any[];
}

export interface ParseStructuredImportArgs {
  buffer: string | ArrayBuffer;
  fileName: string;
}


function getNormalizedHeaderValue(row: any, possibleNames: string[]) {
  const rowKeys = Object.keys(row);
  const normalizedNames = possibleNames.map(n => n.toLowerCase().replace(/[\s _-]+/g, ""));
  
  const key = rowKeys.find(k => {
    const normalizedK = k.toLowerCase().replace(/[\s _-]+/g, "");
    return normalizedNames.includes(normalizedK);
  });
  return key ? row[key] : undefined;
}

export function parseStructuredImport({ buffer, fileName }: ParseStructuredImportArgs): StructuredImportResult {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  const wb = XLSX.read(buffer, { type: "binary" });

  if (isCsv) {
    return parseStructuredCsv(wb);
  } else {
    return parseExcelWorkbook(wb);
  }
}

function parseExcelWorkbook(wb: XLSX.WorkBook): StructuredImportResult {
  const result: StructuredImportResult = {
    formatVersion: 1,
    importMode: "TransactionsOnly",
  };

  // 1. Metadata
  if (wb.SheetNames.includes("Metadata")) {
    const ws = wb.Sheets["Metadata"];
    const rows = XLSX.utils.sheet_to_json(ws);
    if (rows.length > 0 && (rows[0] as any).FormatVersion) {
      result.formatVersion = Number((rows[0] as any).FormatVersion);
    }
  }

  // 2. Accounts
  if (wb.SheetNames.includes("Accounts")) {
    const ws = wb.Sheets["Accounts"];
    const data = XLSX.utils.sheet_to_json(ws);
    if (data.length > 0) {
      result.accounts = data.map((row: any) => ({
        name: getNormalizedHeaderValue(row, ["name", "account", "conta", "nome"]),
        type: getNormalizedHeaderValue(row, ["type", "tipo"]),
        balance: parseNumber(getNormalizedHeaderValue(row, ["balance", "saldo"])),
        currency: getNormalizedHeaderValue(row, ["currency", "moeda"]) || "EUR",
      })).filter((a: any) => a.name);
      result.importMode = "FullBackup";
    }
  }

  // 3. Transactions
  if (wb.SheetNames.includes("Transactions")) {
    const ws = wb.Sheets["Transactions"];
    const data = XLSX.utils.sheet_to_json(ws);
    if (data.length > 0) {
      result.transactions = data.map((row: any) => parseTransactionRow(row, result.formatVersion));
    }
  }

  // 4. Investments
  if (wb.SheetNames.includes("Investments")) {
    const ws = wb.Sheets["Investments"];
    const data = XLSX.utils.sheet_to_json(ws);
    if (data.length > 0) {
      result.investments = data.map((row: any) => ({
        name: getNormalizedHeaderValue(row, ["name", "nome"]),
        type: getNormalizedHeaderValue(row, ["type", "tipo"]),
        costBasis: (() => { const v = getNormalizedHeaderValue(row, ['costbasis', 'cost basis']); return v === undefined || v === null || v === '' ? null : parseNumber(v); })(),
        marketValue: parseNumber(getNormalizedHeaderValue(row, ["marketvalue", "market value"])),
      })).filter((i: any) => i.name);
    }
  }

  // 5. Goals
  if (wb.SheetNames.includes("Goals")) {
    const ws = wb.Sheets["Goals"];
    const data = XLSX.utils.sheet_to_json(ws);
    if (data.length > 0) {
      result.goals = data.map((row: any) => ({
        name: getNormalizedHeaderValue(row, ["name", "objetivo", "nome"]),
        type: getNormalizedHeaderValue(row, ["type", "tipo"]),
        targetAmount: parseNumber(getNormalizedHeaderValue(row, ["targetamount", "target"])),
        currentAmount: parseNumber(getNormalizedHeaderValue(row, ["currentamount", "current"])),
      })).filter((g: any) => g.name);
    }
  }

  // 6. Snapshots
  if (wb.SheetNames.includes("Snapshots")) {
    const ws = wb.Sheets["Snapshots"];
    const data = XLSX.utils.sheet_to_json(ws);
    if (data.length > 0) {
      result.snapshots = data.map((row: any) => {
        const year = parseNumber(getNormalizedHeaderValue(row, ["year", "ano"]));
        const month = parseNumber(getNormalizedHeaderValue(row, ["month", "mês", "mes"]));
        const netWorth = parseNumber(getNormalizedHeaderValue(row, ["networth", "net worth"]));
        const liquidAssets = parseNumber(getNormalizedHeaderValue(row, ["liquidassets", "liquid assets"]));
        const investmentsValue = parseNumber(getNormalizedHeaderValue(row, ["investments", "investmentsvalue", "investments value"]));
        const savingsRate = parseNumber(getNormalizedHeaderValue(row, ["savingsrate", "savings rate"]));
        
        if (!year || !month) return null;
        
        return {
          year,
          month,
          netWorth,
          liquidAssets,
          investmentsValue,
          savingsRate,
        };
      }).filter((s: any) => s !== null);
    }
  }

  // Fallback for V1 format (e.g. just a generic sheet with no specific names)
  if (!result.transactions && wb.SheetNames.length > 0) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawArrays: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const rawHeaders = (rawArrays[0] || []).map((h: any) => String(h).toLowerCase().trim());
    const hasAmount = rawHeaders.includes("amount") || rawHeaders.includes("valor (€)") || rawHeaders.includes("valor");
    const hasDesc = rawHeaders.includes("description") || rawHeaders.includes("descrição") || rawHeaders.includes("descricao");
    if (hasAmount && hasDesc) {
      const data = XLSX.utils.sheet_to_json(ws);
      result.transactions = data.map((row: any) => parseTransactionRow(row, 1));
    }
  }

  return result;
}

function parseStructuredCsv(wb: XLSX.WorkBook): StructuredImportResult {
  const result: StructuredImportResult = {
    formatVersion: 1,
    importMode: "TransactionsOnly",
  };

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(ws);
  if (rawData.length === 0) return result;

  const rawArrays: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const rawHeaders = (rawArrays[0] || []).map((h: any) => String(h).toLowerCase().trim());

  const hasAmount = rawHeaders.includes("amount") || rawHeaders.includes("valor (€)") || rawHeaders.includes("valor");
  const hasDesc = rawHeaders.includes("description") || rawHeaders.includes("descrição") || rawHeaders.includes("descricao");

  if (!hasAmount || !hasDesc) return result; // Invalid CSV

  // Check if it's V2 via headers
  if (rawHeaders.includes("direction")) {
    result.formatVersion = 2;
  }

  result.transactions = rawData.map((row: any) => parseTransactionRow(row, result.formatVersion));

  return result;
}

function parseTransactionRow(row: any, formatVersion: number) {
  const rowKeys = Object.keys(row);
  const getVal = (possibleNames: string[]) => {
    const key = rowKeys.find(k => possibleNames.includes(k.toLowerCase().trim()));
    return key ? row[key] : undefined;
  };

  const rawDate = getVal(["date", "data"]);
  const rawDesc = getVal(["description", "descrição", "descricao"]);
  const rawTypeOrDir = getVal(["type", "tipo", "direction", "direção", "direcao"]);
  const rawAmount = getVal(["amount", "valor (€)", "valor"]);
  const rawAccount = getVal(["account", "accountname", "conta"]);
  const rawDestAccount = getVal(["destinationaccount", "destination account", "conta destino"]);
  const rawCategory = getVal(["category", "categoryname", "categoria"]);
  const rawTags = getVal(["tags", "tag"]);
  const rawNotes = getVal(["notes", "notas"]);

  let finalDirection = "Debit";
  
  if (formatVersion >= 2) {
    // V2 explicitly provides direction
    finalDirection = String(rawTypeOrDir || "Debit");
  } else {
    // Legacy V1 parse
    const legacyType = parseLegacyTransactionType(rawTypeOrDir);
    if (legacyType === "Income" || legacyType === "Interest") {
      finalDirection = "Credit";
    } else if (legacyType === "Expense" || legacyType === "Tax" || legacyType === "Investment") {
      finalDirection = "Debit";
    } else if (legacyType === "Transfer") {
      if (rawDestAccount) {
        finalDirection = "InternalTransfer";
      } else {
        finalDirection = "Debit"; // without dest, falls back to Debit
      }
    }
  }

  let finalCategory = rawCategory || "";
  if (formatVersion < 2 && !rawCategory) {
    const legacyType = parseLegacyTransactionType(rawTypeOrDir);
    if (legacyType === "Interest") finalCategory = "Interest";
    else if (legacyType === "Tax") finalCategory = "Tax";
    else if (legacyType === "Investment") finalCategory = "Investment";
    else if (legacyType === "Transfer") finalCategory = "Transfer";
    else finalCategory = "Uncategorized";
  } else if (!rawCategory) {
    // Missing category in V2+
    finalCategory = "Uncategorized";
  }

  return {
    date: parseDate(rawDate),
    description: rawDesc || "Imported Entry",
    direction: finalDirection,
    amount: Math.abs(parseNumber(rawAmount)),
    accountName: rawAccount || "Bank",
    destinationAccountName: rawDestAccount || null,
    categoryName: finalCategory,
    tags: rawTags || "",
    notes: rawNotes || "",
  };
}


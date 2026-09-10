export const parseNumber = (val: any) => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const str = String(val).trim();
  let clean = str.replace(/[^\d,\.-]/g, "");
  if (clean.includes(",")) {
    const lastCommaIndex = clean.lastIndexOf(",");
    const withoutCommas =
      clean.substring(0, lastCommaIndex).replace(/[,\.]/g, "") +
      "." +
      clean.substring(lastCommaIndex + 1).replace(/[,\.]/g, "");
    return Number(withoutCommas) || 0;
  }
  return Number(clean) || 0;
};

export const parseDate = (val: any) => {
  if (!val) return new Date().toISOString().split("T")[0];
  const str = String(val).trim();
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return str;
};

export const parseLegacyTransactionType = (val: any) => {
  const s = String(val || "")
    .toLowerCase()
    .trim();
  if (
    s === "entrada" ||
    s === "income" ||
    s === "credit" ||
    s === "crédito" ||
    s === "credito"
  )
    return "Income";
  if (s === "transfer" || s === "transferência" || s === "transferencia")
    return "Transfer";
  if (s === "interest" || s === "juros") return "Interest";
  if (s === "tax" || s === "imposto") return "Tax";
  if (s === "investment" || s === "investimento") return "Investment";
  return "Expense";
};

export function normalizeCurrency(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export const calculateSnapshotValuation = (
  snapshot: import("./types").SnapshotEvidence,
) => {
  let investedValue: number | null = null;
  let investedCurrency: string | null = null;

  if (snapshot.positions.length > 0) {
    let hasInvalidPosition = false;
    const posCurrencies = new Set<string>();
    let sum = 0;

    for (const p of snapshot.positions) {
      if (
        p.marketValue === null ||
        p.marketValue === undefined ||
        !normalizeCurrency(p.currency)
      ) {
        hasInvalidPosition = true;
        break;
      }
      sum += p.marketValue;
      posCurrencies.add(normalizeCurrency(p.currency) as string);
    }

    if (!hasInvalidPosition && posCurrencies.size === 1) {
      investedValue = sum;
      investedCurrency = Array.from(posCurrencies)[0];
    }
  }

  let cashValue: number | null = null;
  let cashCurrency: string | null = null;

  if (snapshot.cashBalances.length > 0) {
    let hasInvalidCash = false;
    const cashCurrs = new Set<string>();
    let sum = 0;

    for (const c of snapshot.cashBalances) {
      if (
        c.amount === null ||
        c.amount === undefined ||
        !normalizeCurrency(c.currency)
      ) {
        hasInvalidCash = true;
        break;
      }
      sum += c.amount;
      cashCurrs.add(normalizeCurrency(c.currency) as string);
    }

    if (!hasInvalidCash && cashCurrs.size === 1) {
      cashValue = sum;
      cashCurrency = Array.from(cashCurrs)[0];
    }
  }

  const overallTotals = snapshot.totals.filter((t) => t.type === "OVERALL");
  let totalValue: number | null = null;
  let totalCurrency: string | null = null;

  if (
    overallTotals.length === 1 &&
    normalizeCurrency(overallTotals[0].currency)
  ) {
    totalValue = overallTotals[0].amount;
    totalCurrency = normalizeCurrency(overallTotals[0].currency);
  } else if (
    investedValue !== null &&
    cashValue !== null &&
    investedCurrency &&
    cashCurrency &&
    investedCurrency === cashCurrency
  ) {
    totalValue = investedValue + cashValue;
    totalCurrency = investedCurrency;
  }

  return {
    totalValue,
    totalCurrency,
    investedValue,
    investedCurrency,
    cashValue,
    cashCurrency,
  };
};

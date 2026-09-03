import {
  BrokerSnapshot,
  BrokerPosition,
  BrokerCashBalance,
  BrokerSnapshotTotal,
} from "./schema";

export function isValidISIN(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;

  let isinStr = "";
  for (let i = 0; i < 11; i++) {
    const charCode = isin.charCodeAt(i);
    if (charCode >= 48 && charCode <= 57) {
      isinStr += isin[i];
    } else {
      isinStr += (charCode - 55).toString();
    }
  }

  let sum = 0;
  let alternate = true;
  for (let i = isinStr.length - 1; i >= 0; i--) {
    let n = parseInt(isinStr[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) {
        n = (n % 10) + 1;
      }
    }
    sum += n;
    alternate = !alternate;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return checksum === parseInt(isin[11], 10);
}

export function parseDate(dateStr: string): string | null {
  const match1 = dateStr.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (match1) return match1[0];

  const match2 = dateStr.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (match2) return `${match2[3]}-${match2[2]}-${match2[1]}`;

  const match3 = dateStr.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (match3) return `${match3[3]}-${match3[2]}-${match3[1]}`;

  return null;
}

export function parseNumber(numStr: string): number | null {
  if (!numStr) return null;
  const clean = numStr.replace(/[^0-9.,-]/g, "");
  if (!clean) return null;

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      return parseFloat(clean.replace(/\./g, "").replace(",", "."));
    } else {
      return parseFloat(clean.replace(/,/g, ""));
    }
  } else if (lastComma > -1) {
    const decimals = clean.length - 1 - lastComma;
    if (decimals === 3) {
      return parseFloat(clean.replace(/,/g, ""));
    } else {
      return parseFloat(clean.replace(",", "."));
    }
  } else if (lastDot > -1) {
    return parseFloat(clean);
  }
  return parseFloat(clean);
}

function extractCurrency(line: string): string | null {
  if (line.includes("EUR")) return "EUR";
  if (line.includes("USD")) return "USD";
  if (line.includes("GBP")) return "GBP";
  if (line.includes("CHF")) return "CHF";
  return null;
}

export function extractDeterministic(rawText: string): BrokerSnapshot {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let statementDate: string | null = null;
  const positions: BrokerPosition[] = [];
  const cashBalances: BrokerCashBalance[] = [];
  const totals: BrokerSnapshotTotal[] = [];
  const capabilities = new Set<string>();
  const extractionWarnings: string[] = [];

  let currentSection = "UNKNOWN";
  let currentPositionSection: string | null = null;
  let currentPositionCurrency: string | null = null;
  let documentCurrency: string | null = null;
  let blockLines: string[] = [];

  const flushBlock = () => {
    if (blockLines.length === 0) return;
    const blockText = blockLines.join("\n");

    const firstLine = blockLines[0];
    const isinMatch = blockText.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);
    let isin = null;
    if (isinMatch && isValidISIN(isinMatch[1])) {
      isin = isinMatch[1];
    }

    const blockTextWithoutIsin = isin ? blockText.replace(isin, "") : blockText;
    const dates =
      blockTextWithoutIsin.match(
        /\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\.\d{2}\.\d{4}\b|\b\d{2}\/\d{2}\/\d{4}\b/g,
      ) || [];
    const valuationDateStr = dates.length > 0 ? dates[0] : null;
    const valuationDate = valuationDateStr ? parseDate(valuationDateStr) : null;

    let blockTextWithoutDates = blockTextWithoutIsin;
    for (const d of dates) {
      blockTextWithoutDates = blockTextWithoutDates.replace(d, "");
    }

    const numMatchFirst = firstLine.match(/^(\d+(?:[.,]\d+)*|-?\d+)/);
    const qty = numMatchFirst ? parseNumber(numMatchFirst[0]) : null;

    let name = firstLine
      .replace(/^(\d+(?:[.,]\d+)*|-?\d+)/, "")
      .replace(
        /\b(pcs\.?|shares|pieces|units|nominal|ticker|qty|price|value)\b/gi,
        "",
      )
      .trim()
      .replace(/^[^a-zA-Z0-9]+/, "")
      .replace(/  +/g, " ")
      .replace(/^- /, "");

    let ticker = null;
    if (!isin) {
      const linesNoFirst = blockLines.slice(1);
      for (const l of linesNoFirst) {
        if (/^[A-Z0-9]{2,5}$/.test(l.trim())) {
          ticker = l.trim();
          break;
        }
      }
    }

    // Re-extract numbers from block ignoring the first quantity number text and ticker text
    // We will grab the last two numbers of the block
    let bodyText = blockTextWithoutDates.substring(firstLine.length);
    if (ticker) {
      bodyText = bodyText.replace(new RegExp(`\\b${ticker}\\b`, "g"), "");
    }
    const numbers = bodyText.match(/-?\d+(?:[.,]\d+)*|-?\d+/g) || [];

    let price = null;
    let value = null;
    if (numbers.length >= 2) {
      value = parseNumber(numbers[numbers.length - 1]);
      price = parseNumber(numbers[numbers.length - 2]);
    } else if (numbers.length === 1) {
      extractionWarnings.push(
        `Ambiguous price/market value for block: ${firstLine}`,
      );
    }

    const currency = currentPositionCurrency;

    const sectionName = (currentPositionSection ?? "").toLowerCase();

    const assetClass = sectionName.includes("crypto")
      ? "Crypto"
      : sectionName.includes("equities")
        ? "Equity"
        : null;

    if (qty !== null || price !== null || value !== null) {
      positions.push({
        name: name || null,
        sourceSection: currentPositionSection,
        assetClass: assetClass,
        isin: isin,
        ticker: ticker,
        instrumentIdentifier: isin || ticker || null,
        instrumentIdentifierType: isin ? "ISIN" : ticker ? "TICKER" : null,
        quantity: qty,
        unitPrice: price,
        marketValue: value,
        currency: currency,
        valuationDate: valuationDate,
      });
      capabilities.add("POSITIONS");
      if (qty !== null) capabilities.add("QUANTITIES");
      if (price !== null) capabilities.add("PRICES");
      if (value !== null) capabilities.add("MARKET_VALUES");
    } else {
      extractionWarnings.push(
        `Could not extract values for block: ${firstLine}`,
      );
    }
    blockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const l = line.toLowerCase();

    const curr = extractCurrency(line);
    if (l.includes("portfolio value") && curr) {
      documentCurrency = curr;
    }

    if (
      (l.includes("statement date") ||
        l.includes("as of") ||
        l.includes("date")) &&
      !statementDate
    ) {
      const d = parseDate(line);
      if (d && l.includes("as of")) {
        statementDate = d;
        capabilities.add("SNAPSHOT_DATE");
      } else if (d && !l.includes("as of")) {
        // sometimes date is on the next line or same line, it's safer to only grab it if it's explicitly labelled, or we grab the first date
        statementDate = d;
        capabilities.add("SNAPSHOT_DATE");
      }
    }

    // Catch dates sitting alone on the next line
    if (!statementDate && lines[i - 1]?.toLowerCase().includes("date")) {
      const d = parseDate(line);
      if (d) {
        statementDate = d;
        capabilities.add("SNAPSHOT_DATE");
      }
    }

    if (
      l === "brokerage" ||
      l === "crypto wallet" ||
      l === "positions" ||
      l === "equities"
    ) {
      flushBlock();

      currentSection = "POSITIONS";
      currentPositionSection = line;
      currentPositionCurrency = null;
    } else if (l.includes("security name")) {
      flushBlock();

      currentSection = "POSITIONS";

      if (!currentPositionSection) {
        currentPositionSection = "Positions";
      }

      const tableCurrency = extractCurrency(line);

      if (tableCurrency) {
        currentPositionCurrency = tableCurrency;
      }
    } else if (l === "cash" || l.includes("cash in your current account")) {
      if (!l.includes("portfolio value")) {
        flushBlock();
        currentSection = "CASH";
      }
    } else if (
      l.includes("portfolio value") ||
      l.includes("net worth statement")
    ) {
      flushBlock();
      currentSection = "TOTALS";
    } else if (l.includes("number of positions:")) {
      flushBlock();
      currentSection = "UNKNOWN";
      currentPositionSection = null;
      currentPositionCurrency = null;
    }

    if (currentSection === "POSITIONS") {
      const numMatch = line.match(/^(\d+(?:[.,]\d+)*|-?\d+)/);
      let firstWord = line.split(" ")[0] || "";
      const dateMatch = parseDate(firstWord);

      if (
        numMatch &&
        !dateMatch &&
        numMatch[0] === firstWord &&
        /[a-zA-Z]/.test(line)
      ) {
        flushBlock();
        blockLines.push(line);
      } else {
        if (blockLines.length > 0) {
          blockLines.push(line);
        }
      }
    } else if (currentSection === "CASH") {
      if (l.includes("current account") || l.includes("balance")) {
        const nums = line.match(/-?\d+(?:[.,]\d+)*|-?\d+/g) || [];
        const numsWithoutDates = nums.filter((n) => !parseDate(n));
        if (numsWithoutDates.length > 0) {
          const amt = parseNumber(
            numsWithoutDates[numsWithoutDates.length - 1],
          );
          const cashCurrency = extractCurrency(line) || documentCurrency;
          if (!cashCurrency) {
            extractionWarnings.push(
              `Could not determine cash currency for line: ${line}`,
            );
          } else if (
            amt !== null &&
            cashBalances.every((c) => c.label !== "Cash")
          ) {
            cashBalances.push({
              type: "TOTAL",
              label: "Cash",
              currency: cashCurrency,
              amount: amt,
            });

            capabilities.add("CASH_BALANCES");
          }
        }
      }
    } else if (currentSection === "TOTALS") {
      if (
        l.includes("brokerage") ||
        l.includes("crypto wallet") ||
        l.includes("cash") ||
        l.includes("total") ||
        l.includes("overall")
      ) {
        const nums = line.match(/-?\d+(?:[.,]\d+)*|-?\d+/g) || [];

        const numsWithoutDates = nums.filter((n) => !parseDate(n));

        if (numsWithoutDates.length > 0) {
          const amt = parseNumber(
            numsWithoutDates[numsWithoutDates.length - 1],
          );

          if (amt !== null) {
            const totalCurrency = extractCurrency(line) || documentCurrency;

            if (!totalCurrency) {
              extractionWarnings.push(
                `Could not determine total currency for line: ${line}`,
              );
            } else if (l.includes("total") || l.includes("overall")) {
              totals.push({
                type: "OVERALL",
                label: "Overall",
                currency: totalCurrency,
                amount: amt,
              });

              capabilities.add("PORTFOLIO_TOTALS");
            } else if (l.includes("brokerage")) {
              totals.push({
                type: "SECTION_TOTAL",
                label: "Brokerage",
                currency: totalCurrency,
                amount: amt,
              });
            } else if (l.includes("crypto wallet")) {
              totals.push({
                type: "SECTION_TOTAL",
                label: "Crypto Wallet",
                currency: totalCurrency,
                amount: amt,
              });
            } else if (l.includes("cash")) {
              totals.push({
                type: "CASH",
                label: "Cash",
                currency: totalCurrency,
                amount: amt,
              });
            }
          }
        }
      }
    }
  }
  flushBlock();

  let completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN" = "PARTIAL";

  if (positions.length === 0 && cashBalances.length === 0) {
    completeness = "UNKNOWN";
  } else if (extractionWarnings.length === 0) {
    const overall = totals.find((t) => t.type === "OVERALL");

    if (overall) {
      const allPositionsHaveValues = positions.every(
        (p) =>
          p.quantity !== null && p.unitPrice !== null && p.marketValue !== null,
      );

      const allPositionsUseOverallCurrency = positions.every(
        (p) => p.marketValue === null || p.currency === overall.currency,
      );

      const allCashUsesOverallCurrency = cashBalances.every(
        (c) => c.currency === overall.currency,
      );

      if (
        allPositionsHaveValues &&
        allPositionsUseOverallCurrency &&
        allCashUsesOverallCurrency
      ) {
        const positionTotal = positions.reduce(
          (sum, p) => sum + (p.marketValue ?? 0),
          0,
        );

        const cashTotal = cashBalances.reduce((sum, c) => sum + c.amount, 0);

        if (Math.abs(overall.amount - (positionTotal + cashTotal)) < 0.05) {
          completeness = "COMPLETE";
        }
      }
    }
  }

  return {
    statementDate,
    dateProvenance: statementDate ? "DOCUMENT" : "UNKNOWN",
    completeness,
    capabilities: Array.from(capabilities) as any,
    positions,
    cashBalances,
    totals,
    extractionWarnings:
      extractionWarnings.length > 0 ? extractionWarnings : undefined,
  };
}

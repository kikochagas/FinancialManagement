import { BrokerSnapshot, BrokerPosition } from "./schema";
import { isValidISIN } from "./deterministic-extractor";

export type MatchMethod = "ISIN" | "STABLE_ID" | "TICKER" | "NAME" | "NONE";
export type MatchStatus =
  "MATCHED" | "NEW" | "AMBIGUOUS" | "CONFLICT" | "UNCHANGED";

export interface ExistingInvestment {
  id: string;
  accountId: string | null;
  name: string;
  type: string;
  symbol: string | null;
  quantity: number;
  marketValue: number;
  isin: string | null;
  instrumentIdentifier: string | null;
  instrumentIdentifierType: string | null;
}

export interface ProposedChanges {
  quantity?: number;
  marketValue?: number;
  isin?: string;
  symbol?: string;
  instrumentIdentifier?: string;
  instrumentIdentifierType?: string;
}

export interface PositionReconciliation {
  importedPosition: BrokerPosition;
  matchedInvestmentId: string | null;
  matchMethod: MatchMethod;
  status: MatchStatus;
  proposedChanges: ProposedChanges | null;
  reason: string | null;
}

export interface SnapshotReconciliation {
  accountId: string;
  positions: PositionReconciliation[];
}

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function reconcileSnapshot(
  snapshot: BrokerSnapshot,
  accountId: string,
  investments: ExistingInvestment[],
): SnapshotReconciliation {
  const accountInvestments = investments.filter(
    (i) => i.accountId === accountId,
  );
  const results: PositionReconciliation[] = [];

  for (const p of snapshot.positions) {
    const validIsin = p.isin && isValidISIN(p.isin) ? p.isin : null;

    const trustedInstrumentIdentifier =
      p.instrumentIdentifier &&
      p.instrumentIdentifierType &&
      (p.instrumentIdentifierType.toUpperCase() !== "ISIN" ||
        isValidISIN(p.instrumentIdentifier))
        ? {
            value: p.instrumentIdentifier,
            type: p.instrumentIdentifierType,
          }
        : null;

    let matchedId: string | null = null;
    let matchMethod: MatchMethod = "NONE";
    let status: MatchStatus = "NEW";
    let reason: string | null = null;
    let matchedInv: ExistingInvestment | null = null;

    // 1. ISIN
    if (validIsin) {
      const byIsin = accountInvestments.filter((i) => i.isin === validIsin);
      if (byIsin.length === 1) {
        matchedInv = byIsin[0];
        matchMethod = "ISIN";
      }
    }

    // 2. Generic Stable ID
    if (!matchedInv && trustedInstrumentIdentifier) {
      const byStable = accountInvestments.filter(
        (i) =>
          i.instrumentIdentifier === trustedInstrumentIdentifier.value &&
          i.instrumentIdentifierType === trustedInstrumentIdentifier.type,
      );

      if (byStable.length === 1) {
        matchedInv = byStable[0];
        matchMethod = "STABLE_ID";
      }
    }

    // 3. Ticker
    if (!matchedInv && p.ticker) {
      const byTicker = accountInvestments.filter((i) => i.symbol === p.ticker);
      if (byTicker.length > 1) {
        status = "AMBIGUOUS";
        reason = `Multiple existing investments found with ticker ${p.ticker}.`;
        matchMethod = "TICKER";
      } else if (byTicker.length === 1) {
        const candidate = byTicker[0];
        // Check conflicts
        const isinConflict =
          validIsin && candidate.isin && validIsin !== candidate.isin;
        const stableConflict =
          trustedInstrumentIdentifier &&
          candidate.instrumentIdentifier &&
          (trustedInstrumentIdentifier.value !==
            candidate.instrumentIdentifier ||
            trustedInstrumentIdentifier.type !==
              candidate.instrumentIdentifierType);

        if (isinConflict || stableConflict) {
          status = "CONFLICT";
          reason = `Matched by ticker ${p.ticker} but identifiers conflict.`;
          matchMethod = "TICKER";
          matchedInv = candidate;
        } else {
          matchedInv = candidate;
          matchMethod = "TICKER";
        }
      }
    }

    // 4. Normalized Name
    if (!matchedInv && p.name && status === "NEW") {
      // don't override AMBIGUOUS/CONFLICT from Ticker
      const normPName = normalize(p.name);
      const byName = accountInvestments.filter(
        (i) => normalize(i.name) === normPName,
      );
      if (byName.length === 1) {
        matchedInv = byName[0];
        matchMethod = "NAME";
        status = "AMBIGUOUS";
        reason = `Weak match by normalized name.`;
      } else if (byName.length > 1) {
        status = "AMBIGUOUS";
        reason = `Multiple existing investments match by name.`;
        matchMethod = "NAME";
      }
    }

    // Resolve changes for MATCHED/UNCHANGED/CONFLICT/AMBIGUOUS (if matchedInv is present)
    let proposedChanges: ProposedChanges | null = null;
    if (matchedInv) {
      matchedId = matchedInv.id;
      if (status !== "CONFLICT" && status !== "AMBIGUOUS") {
        status = "MATCHED";
      }

      const diff: ProposedChanges = {};
      let hasDiff = false;

      // Compare quantity using small epsilon for float precision
      if (
        p.quantity !== null &&
        Math.abs(p.quantity - matchedInv.quantity) > 0.000001
      ) {
        diff.quantity = p.quantity;
        hasDiff = true;
      }

      // Compare market value (epsilon 0.01 for currency)
      if (
        p.marketValue !== null &&
        Math.abs(p.marketValue - matchedInv.marketValue) > 0.01
      ) {
        diff.marketValue = p.marketValue;
        hasDiff = true;
      }

      // Propagate missing identifiers
      if (validIsin && !matchedInv.isin) {
        diff.isin = validIsin;
        hasDiff = true;
      }
      if (p.ticker && !matchedInv.symbol) {
        diff.symbol = p.ticker;
        hasDiff = true;
      }
      if (trustedInstrumentIdentifier && !matchedInv.instrumentIdentifier) {
        diff.instrumentIdentifier = trustedInstrumentIdentifier.value;
        diff.instrumentIdentifierType = trustedInstrumentIdentifier.type;
        hasDiff = true;
      }

      if (hasDiff) {
        proposedChanges = diff;
      } else {
        if (status === "MATCHED") status = "UNCHANGED";
      }
    }

    results.push({
      importedPosition: p,
      matchedInvestmentId: matchedId,
      matchMethod,
      status,
      proposedChanges,
      reason,
    });
  }

  return {
    accountId,
    positions: results,
  };
}

import { CanonicalEventType } from "./types";

export function normalizeEventType(rawType: string): CanonicalEventType | "IGNORE" | null {
  if (!rawType) return null;

  const normalized = rawType.toUpperCase().trim().replace(/[\s_-]+/g, "_");

  switch (normalized) {
    case "BUY":
    case "PURCHASE":
    case "COMPRA":
      return "BUY";
    case "SELL":
    case "SALE":
    case "VENDA":
      return "SELL";
    case "DIVIDEND":
    case "DIVIDEND_PAYMENT":
      return "DIVIDEND";
    case "INTEREST":
    case "INTEREST_PAYMENT":
      return "INTEREST";
    case "TRANSFER_INBOUND":
    case "TRANSFER_INSTANT_INBOUND":
    case "DEPOSIT":
      return "CASH_DEPOSIT";
    case "TRANSFER_OUTBOUND":
    case "TRANSFER_INSTANT_OUTBOUND":
    case "WITHDRAWAL":
      return "CASH_WITHDRAWAL";
    case "FREE_RECEIPT":
    case "TRANSFER_IN":
      return "ASSET_TRANSFER_IN";
    case "MIGRATION":
      return "CORPORATE_ACTION";
    case "FEE":
      return "FEE";
    case "TAX":
      return "TAX";
    // We intentionally don't map "UNKNOWN" silently to "OTHER".
    default:
      return null;
  }
}

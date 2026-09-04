export const AccountType = {
  BANK: "Bank",
  BENEFITS: "Benefits",
  CASH: "Cash",
  CRYPTO_WALLET: "Crypto Wallet",
  BROKER: "Broker",
  CREDIT_CARD: "Credit Card",
} as const;

export const TransactionType = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Transfer",
  INVESTMENT: "Investment",
  INTEREST: "Interest",
  TAX: "Tax",
} as const;

export const CategoryType = {
  INCOME: "Income",
  EXPENSE: "Expense",
} as const;

export const InvestmentType = {
  STOCKS: "Stocks",
  BITCOIN: "Bitcoin",
  ETHEREUM: "Ethereum",
  OTHER_CRYPTO: "Other Crypto",
} as const;

export const GoalType = {
  EMERGENCY_FUND: "EMERGENCY_FUND",
  HOUSE: "HOUSE",
  IRS: "IRS",
  CUSTOM: "CUSTOM",
} as const;

export const BankConnectionStatus = {
  CONNECTED: "CONNECTED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;

export const OpenBankingCashAccountType = {
  CURRENT: "CACC",
  SAVINGS: "SVGS",
  CARD: "CARD",
} as const;

export const LinkAction = {
  CREATE: "CREATE",
  LINK: "LINK",
  IGNORE: "IGNORE",
} as const;

export type TAccountType = (typeof AccountType)[keyof typeof AccountType];
export type TTransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];
export type TCategoryType = (typeof CategoryType)[keyof typeof CategoryType];
export type TInvestmentType =
  (typeof InvestmentType)[keyof typeof InvestmentType];
export type TGoalType = (typeof GoalType)[keyof typeof GoalType];
export type TBankConnectionStatus =
  (typeof BankConnectionStatus)[keyof typeof BankConnectionStatus];
export type TOpenBankingCashAccountType =
  (typeof OpenBankingCashAccountType)[keyof typeof OpenBankingCashAccountType];
export type TLinkAction = (typeof LinkAction)[keyof typeof LinkAction];

export const LIQUID_ACCOUNT_TYPES = new Set<TAccountType>([
  AccountType.BANK,
  AccountType.CASH,
  AccountType.BROKER,
]);
export function isLiquidAccountType(type: string): boolean {
  return LIQUID_ACCOUNT_TYPES.has(type as TAccountType);
}
export const INVESTMENT_ACCOUNT_TYPES = new Set<TAccountType>([
  AccountType.BROKER,
  AccountType.CRYPTO_WALLET,
]);

export function canHoldInvestments(type: string): boolean {
  return INVESTMENT_ACCOUNT_TYPES.has(type as TAccountType);
}

export function mapBrokerAssetClassToInvestmentType(
  assetClass: string | null,
  ticker: string | null,
): string {
  const normAsset = (assetClass || "").toLowerCase();
  const normTicker = (ticker || "").toUpperCase();

  if (normAsset.includes("crypto")) {
    if (normTicker === "BTC" || normTicker === "BITCOIN")
      return InvestmentType.BITCOIN;
    if (normTicker === "ETH" || normTicker === "ETHEREUM")
      return InvestmentType.ETHEREUM;
    return InvestmentType.OTHER_CRYPTO;
  }

  return InvestmentType.STOCKS;
}

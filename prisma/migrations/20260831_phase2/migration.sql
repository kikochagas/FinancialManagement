-- CreateTable
CREATE TABLE "InvestmentAccountSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "statementDate" DATETIME NOT NULL,
    "statementDateSource" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentFingerprint" TEXT NOT NULL,
    "completeness" TEXT NOT NULL,
    CONSTRAINT "InvestmentAccountSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentAccountSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentPositionSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "name" TEXT,
    "sourceSection" TEXT,
    "assetClass" TEXT,
    "isin" TEXT,
    "ticker" TEXT,
    "instrumentIdentifier" TEXT,
    "instrumentIdentifierType" TEXT,
    "quantity" REAL,
    "unitPrice" REAL,
    "marketValue" REAL,
    "currency" TEXT,
    "valuationDate" DATETIME,
    CONSTRAINT "InvestmentPositionSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "InvestmentAccountSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentCashSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "type" TEXT,
    "label" TEXT,
    "currency" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "InvestmentCashSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "InvestmentAccountSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentSnapshotTotal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "currency" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "InvestmentSnapshotTotal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "InvestmentAccountSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "symbol" TEXT,
    "quantity" REAL NOT NULL DEFAULT 0,
    "costBasis" REAL,
    "marketValue" REAL NOT NULL,
    "profit" REAL,
    "allocation" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "accountId" TEXT,
    "isin" TEXT,
    "instrumentIdentifier" TEXT,
    "instrumentIdentifierType" TEXT,
    CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Investment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Investment" ("allocation", "costBasis", "id", "marketValue", "name", "profit", "quantity", "symbol", "type", "updatedAt", "userId") SELECT "allocation", "costBasis", "id", "marketValue", "name", "profit", "quantity", "symbol", "type", "updatedAt", "userId" FROM "Investment";
DROP TABLE "Investment";
ALTER TABLE "new_Investment" RENAME TO "Investment";
CREATE UNIQUE INDEX "Investment_accountId_isin_key" ON "Investment"("accountId", "isin");
CREATE UNIQUE INDEX "Investment_accountId_instrumentIdentifierType_instrumentIdentifier_key" ON "Investment"("accountId", "instrumentIdentifierType", "instrumentIdentifier");
CREATE TABLE "new_InvestmentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawEventType" TEXT,
    "rawCategory" TEXT,
    "assetClass" TEXT,
    "instrumentName" TEXT,
    "instrumentIdentifier" TEXT,
    "isin" TEXT,
    "ticker" TEXT,
    "quantity" REAL,
    "unitPrice" REAL,
    "amount" REAL,
    "fee" REAL,
    "tax" REAL,
    "currency" TEXT,
    "originalAmount" REAL,
    "originalCurrency" TEXT,
    "fxRate" REAL,
    "description" TEXT,
    "externalId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "sourceRow" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InvestmentEvent" ("accountId", "amount", "assetClass", "createdAt", "currency", "dedupKey", "description", "eventType", "externalId", "fee", "fxRate", "id", "instrumentIdentifier", "instrumentName", "isin", "occurredAt", "originalAmount", "originalCurrency", "quantity", "rawCategory", "rawEventType", "sourceRow", "tax", "ticker", "unitPrice", "userId") SELECT "accountId", "amount", "assetClass", "createdAt", "currency", "dedupKey", "description", "eventType", "externalId", "fee", "fxRate", "id", "instrumentIdentifier", "instrumentName", "isin", "occurredAt", "originalAmount", "originalCurrency", "quantity", "rawCategory", "rawEventType", "sourceRow", "tax", "ticker", "unitPrice", "userId" FROM "InvestmentEvent";
DROP TABLE "InvestmentEvent";
ALTER TABLE "new_InvestmentEvent" RENAME TO "InvestmentEvent";
CREATE UNIQUE INDEX "InvestmentEvent_accountId_dedupKey_key" ON "InvestmentEvent"("accountId", "dedupKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InvestmentAccountSnapshot_accountId_statementDate_idx" ON "InvestmentAccountSnapshot"("accountId", "statementDate");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentAccountSnapshot_accountId_documentFingerprint_key" ON "InvestmentAccountSnapshot"("accountId", "documentFingerprint");

-- CreateIndex
CREATE INDEX "InvestmentPositionSnapshot_snapshotId_idx" ON "InvestmentPositionSnapshot"("snapshotId");

-- CreateIndex
CREATE INDEX "InvestmentCashSnapshot_snapshotId_idx" ON "InvestmentCashSnapshot"("snapshotId");

-- CreateIndex
CREATE INDEX "InvestmentSnapshotTotal_snapshotId_idx" ON "InvestmentSnapshotTotal"("snapshotId");


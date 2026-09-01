import { BrokerSnapshot } from './schema';
import { parseBrokerPdf } from './pdf-parser';

export async function extractBrokerSnapshot(buffer: Buffer): Promise<BrokerSnapshot> {
  const parsed = await parseBrokerPdf(buffer);
  
  // Deterministic + AI fallback would go here
  // For V1, return a stub UNKNOWN
  return {
    statementDate: undefined,
    completeness: 'UNKNOWN',
    positions: [],
    cashBalances: [],
    totals: []
  };
}

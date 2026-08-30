export interface BrokerCashEvent {
  eventType: string | null;
  amount: number | null;
  fee: number | null;
  tax: number | null;
  currency: string | null;
}

export function deriveEventCashImpact(event: BrokerCashEvent): number {
  if (!event.eventType || event.eventType === "IGNORE" || event.eventType === "UNMAPPED") return 0;
  
  if (event.eventType === "FEE") {
     const baseFee = event.fee != null ? event.fee : (event.amount || 0);
     return baseFee + (event.tax || 0);
  }
  
  if (event.eventType === "TAX") {
     const baseTax = event.tax != null ? event.tax : (event.amount || 0);
     return baseTax + (event.fee || 0);
  }

  return (event.amount || 0) + (event.fee || 0) + (event.tax || 0);
}

export function calculateAccountBalance(
  events: BrokerCashEvent[],
  accountCurrency: string
): { isSafe: boolean; balance: number } {
  let balance = 0;
  let isSafe = true;

  for (const ev of events) {
    if (!ev.eventType || ev.eventType === "IGNORE" || ev.eventType === "UNMAPPED") continue;
    
    const impact = deriveEventCashImpact(ev);
    if (impact !== 0) {
      if (!ev.currency || ev.currency !== accountCurrency) {
        isSafe = false;
        break;
      }
      balance += impact;
    }
  }

  return { 
    isSafe, 
    balance: Math.round(balance * 100) / 100 
  };
}

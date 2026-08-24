import { db } from "@/lib/db";

export async function classifyTransactions(
  userId: string,
  transactions: { candidateIndex: number; description: string; direction: "Debit" | "Credit" }[]
): Promise<Record<number, string | null>> {
  // 1. Fetch user's categories
  const categories = await db.category.findMany({ where: { userId } });
  
  // 2. Fetch user's historical transactions
  const history = await db.transaction.findMany({
    where: { userId, categoryId: { not: null } },
    select: { description: true, categoryId: true },
    orderBy: { date: "desc" },
    take: 1000
  });

  const exactMatchMap = new Map<string, string>();
  for (const h of history) {
    const norm = h.description.toLowerCase().trim();
    if (!exactMatchMap.has(norm) && h.categoryId) {
      exactMatchMap.set(norm, h.categoryId);
    }
  }

  // System fallback mapping
  const systemKeywords: Record<string, string> = {
    // Keywords -> systemKey of default categories
    "uber": "transport",
    "bolt": "transport",
    "mcdonalds": "food",
    "continente": "groceries",
    "pingo doce": "groceries",
    "lidl": "groceries",
    "netflix": "entertainment",
    "spotify": "entertainment",
    "interest": "interest",
    "tax": "tax",
    "irs": "tax",
    "vanguard": "investment",
    "trade republic": "investment",
    "salary": "salary",
    "salario": "salary",
    "vencimento": "salary"
  };

  const results: Record<number, string | null> = {};

  for (const tx of transactions) {
    const desc = tx.description.toLowerCase().trim();
    
    // 1. Exact historical match
    if (exactMatchMap.has(desc)) {
      results[tx.candidateIndex] = exactMatchMap.get(desc)!;
      continue;
    }

    // 2. System keyword match (fallback)
    let matchedSystemKey = null;
    for (const [kw, sysKey] of Object.entries(systemKeywords)) {
      if (desc.includes(kw)) {
        matchedSystemKey = sysKey;
        break;
      }
    }

    if (matchedSystemKey) {
      // Find the user's category that has this systemKey
      const cat = categories.find(c => c.systemKey === matchedSystemKey);
      if (cat) {
        results[tx.candidateIndex] = cat.id;
        continue;
      }
    }

    // 3. Uncategorized fallback
    results[tx.candidateIndex] = null;
  }

  return results;
}

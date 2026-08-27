import { db } from "@/lib/db";

export async function classifyTransactions(
  userId: string,
  transactions: { candidateIndex: number; description: string; direction: "Debit" | "Credit" }[]
): Promise<Record<number, string | null>> {
  // 1. Fetch user's categories
  const categories = await db.category.findMany({ where: { userId } });
  
  // System fallback mapping
  const systemKeywords: Record<string, string> = {
    // Keywords -> systemKey of default categories
    "ordenado": "salary",
    "ordenados": "salary",
    "salário": "salary",
    "salario": "salary",
    "salary": "salary",
    "payroll": "salary",

    "levantamento": "withdrawal",
    "atm": "withdrawal",
    "withdrawal": "withdrawal",

    "transfer": "transfer",
    "transferência": "transfer",
    "transferencia": "transfer",
    "transf": "transfer",
    "sepa": "transfer",

    "comissão": "fees",
    "comissao": "fees",
    "commission": "fees",
    "fee": "fees",
    "fees": "fees",

    "tax": "tax",
    "imposto": "tax",
    "irs": "tax",

    "interest": "interest",
    "juros": "interest",

    "investment": "investment",
    "investimento": "investment",
    "broker": "investment",
    "securities": "investment",

    "compra": "purchase",
    "purchase": "purchase",
    "card payment": "purchase",
  };

  const results: Record<number, string | null> = {};

  const normalizeStr = (str: string) => 
    str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  for (const tx of transactions) {
    const desc = normalizeStr(tx.description);
    
    // 2. System keyword match
    let matchedSystemKey = null;
    const shortKeywords = ["fee", "fees", "tax", "irs", "atm"];

    for (const [kw, sysKey] of Object.entries(systemKeywords)) {
      const normalizedKw = normalizeStr(kw);
      if (shortKeywords.includes(kw)) {
        // Use word boundary for short keywords to prevent substrings ("coffee" -> "fee")
        const regex = new RegExp(`\\b${normalizedKw}\\b`, 'i');
        if (regex.test(desc)) {
          matchedSystemKey = sysKey;
          break;
        }
      } else {
        if (desc.includes(normalizedKw)) {
          matchedSystemKey = sysKey;
          break;
        }
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
    const uncategorized = categories.find(c => c.systemKey === "uncategorized");
    results[tx.candidateIndex] = uncategorized ? uncategorized.id : null;
  }

  return results;
}

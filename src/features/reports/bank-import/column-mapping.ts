import { BankColumnSemantic } from "./types";

interface SemanticMatch {
  semantic: BankColumnSemantic | null;
  confidence: number;
}

// Dictionary mapping normalized headers to Semantics
// 1.0 = exact, strong confidence
// 0.8 = strong partial
// 0.5 = ambiguous
const SEMANTIC_DICTIONARY: Record<string, SemanticMatch> = {
  // BOOKING_DATE
  "data movimento": { semantic: "BOOKING_DATE", confidence: 1.0 },
  "data de movimento": { semantic: "BOOKING_DATE", confidence: 1.0 },
  "booking date": { semantic: "BOOKING_DATE", confidence: 1.0 },
  "transaction date": { semantic: "BOOKING_DATE", confidence: 1.0 },
  "data": { semantic: "BOOKING_DATE", confidence: 0.8 }, // Could be value date, but usually booking
  "date": { semantic: "BOOKING_DATE", confidence: 0.8 },
  "dt op": { semantic: "BOOKING_DATE", confidence: 0.8 }, // ActivoBank/Millennium style
  
  // VALUE_DATE
  "data valor": { semantic: "VALUE_DATE", confidence: 1.0 },
  "value date": { semantic: "VALUE_DATE", confidence: 1.0 },
  "dt ef": { semantic: "VALUE_DATE", confidence: 0.8 }, // Data efectiva
  
  // DESCRIPTION
  "descricao": { semantic: "DESCRIPTION", confidence: 1.0 },
  "descritivo": { semantic: "DESCRIPTION", confidence: 1.0 },
  "movimento": { semantic: "DESCRIPTION", confidence: 0.9 },
  "detalhes": { semantic: "DESCRIPTION", confidence: 0.8 },
  "description": { semantic: "DESCRIPTION", confidence: 1.0 },
  "transaction description": { semantic: "DESCRIPTION", confidence: 1.0 },

  // AMOUNT
  "valor": { semantic: "AMOUNT", confidence: 0.9 }, // Could be balance if contextual
  "montante": { semantic: "AMOUNT", confidence: 1.0 },
  "amount": { semantic: "AMOUNT", confidence: 1.0 },
  "transaction amount": { semantic: "AMOUNT", confidence: 1.0 },
  "imp": { semantic: "AMOUNT", confidence: 0.7 }, // Importancia

  // DEBIT
  "debito": { semantic: "DEBIT", confidence: 1.0 },
  "debit": { semantic: "DEBIT", confidence: 1.0 },
  "withdrawal": { semantic: "DEBIT", confidence: 1.0 },

  // CREDIT
  "credito": { semantic: "CREDIT", confidence: 1.0 },
  "credit": { semantic: "CREDIT", confidence: 1.0 },
  "deposit": { semantic: "CREDIT", confidence: 1.0 },

  // TYPE
  "tipo": { semantic: "TYPE", confidence: 0.9 },
  "sinal": { semantic: "TYPE", confidence: 0.8 },
  
  // BALANCE_AFTER
  "saldo apos movimento": { semantic: "BALANCE_AFTER", confidence: 1.0 },
  "running balance": { semantic: "BALANCE_AFTER", confidence: 1.0 },
  "balance after": { semantic: "BALANCE_AFTER", confidence: 1.0 },
  "saldo": { semantic: "BALANCE_AFTER", confidence: 0.8 },
  "saldo cont": { semantic: "BALANCE_AFTER", confidence: 0.8 },

  // COUNTERPARTY / PAYER / BENEFICIARY
  "counterparty": { semantic: "COUNTERPARTY", confidence: 1.0 },
  "contraparte": { semantic: "COUNTERPARTY", confidence: 1.0 },
  "nome do ordenante": { semantic: "PAYER", confidence: 1.0 },
  "ordenante": { semantic: "PAYER", confidence: 0.9 },
  "payer": { semantic: "PAYER", confidence: 1.0 },
  "nome do beneficiario": { semantic: "BENEFICIARY", confidence: 1.0 },
  "beneficiary": { semantic: "BENEFICIARY", confidence: 1.0 },

  // IBAN
  "iban": { semantic: "IBAN", confidence: 1.0 },
  "nib": { semantic: "IBAN", confidence: 1.0 },
  "conta do ordenante": { semantic: "IBAN", confidence: 0.8 },

  // REFERENCE
  "referencia": { semantic: "REFERENCE", confidence: 1.0 },
  "reference": { semantic: "REFERENCE", confidence: 1.0 }
};

export function getDeterministicSemantic(normalizedHeader: string): SemanticMatch | null {
  // Exact match
  if (SEMANTIC_DICTIONARY[normalizedHeader]) {
    return SEMANTIC_DICTIONARY[normalizedHeader];
  }
  
  // Try partial match if exact fails
  for (const [key, value] of Object.entries(SEMANTIC_DICTIONARY)) {
    if (normalizedHeader.includes(key)) {
      // Degrade confidence slightly for partial match
      return { semantic: value.semantic, confidence: value.confidence * 0.8 };
    }
  }

  return null;
}

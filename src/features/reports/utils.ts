export const parseNumber = (val: any) => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const str = String(val).trim();
  let clean = str.replace(/[^\d,\.-]/g, "");
  if (clean.includes(",")) {
    const lastCommaIndex = clean.lastIndexOf(",");
    const withoutCommas = clean.substring(0, lastCommaIndex).replace(/[,\.]/g, "") + "." + clean.substring(lastCommaIndex + 1).replace(/[,\.]/g, "");
    return Number(withoutCommas) || 0;
  }
  return Number(clean) || 0;
};

export const parseDate = (val: any) => {
  if (!val) return new Date().toISOString().split("T")[0];
  const str = String(val).trim();
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return str;
};

export const parseType = (val: any) => {
  const s = String(val || "").toLowerCase().trim();
  if (s === "entrada" || s === "income" || s === "credit" || s === "crédito" || s === "credito") return "Income";
  return "Expense";
};

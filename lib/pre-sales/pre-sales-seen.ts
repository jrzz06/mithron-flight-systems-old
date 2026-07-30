const PRE_SALES_AUTO_SHOWN_KEY = "mithron:pre-sales-consultation:auto-shown";

function canUseSessionStorage() {
  try {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

export function hasPreSalesAutoShown() {
  if (!canUseSessionStorage()) return false;
  try {
    return window.sessionStorage.getItem(PRE_SALES_AUTO_SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPreSalesAutoShown() {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(PRE_SALES_AUTO_SHOWN_KEY, "1");
  } catch {
    // Ignore quota / private-mode failures — auto-open is best-effort.
  }
}

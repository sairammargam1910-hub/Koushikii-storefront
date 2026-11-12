const internalOrTechnicalLanguage =
  /\b(shopify|cashfree|shiprocket|delhivery|xpressbees|blue\s*dart|dtdc|ecom\s*express|shadowfax|fedex|dhl|aramex|razorpay|phonepe|payu|paypal|stripe|clerk|railway|neon|replit|api|database|postgres(?:ql)?|sql|graphql|webhook|sdk|http(?:s)?|payment gateway|stack trace|typeerror|referenceerror|undefined|null reference|internal server error|network error|request failed|failed to fetch|timed out|timeout|unexpected token|syntaxerror|invalid json|enotfound)\b|ECONN[A-Z]+|HTTP\s?\d{3}|status code\s?\d{3}/i;

export function customerFacingMessage(value: unknown, fallback: string): string {
  const message = typeof value === "string"
    ? value.trim()
    : value instanceof Error
      ? value.message.trim()
      : "";

  if (!message || internalOrTechnicalLanguage.test(message)) return fallback;
  return message;
}

export const SHOPIFY_PRODUCT_DETAIL_FIELDS = [
  "fabricComposition",
  "sareeLength",
  "blousePieceLength",
  "borderDetails",
  "designPattern",
  "washCareInstructions",
  "additionalInformation",
] as const;

export type ShopifyProductDetails = Record<
  (typeof SHOPIFY_PRODUCT_DETAIL_FIELDS)[number],
  string
>;

export const EMPTY_SHOPIFY_PRODUCT_DETAILS: ShopifyProductDetails = {
  fabricComposition: "",
  sareeLength: "",
  blousePieceLength: "",
  borderDetails: "",
  designPattern: "",
  washCareInstructions: "",
  additionalInformation: "",
};

export function parseShopifyProductDetails(
  value: string | null | undefined,
): ShopifyProductDetails {
  if (!value?.trim()) return { ...EMPTY_SHOPIFY_PRODUCT_DETAILS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The Shopify product details metafield is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The Shopify product details metafield must be a JSON object.");
  }

  const source = parsed as Record<string, unknown>;
  const details = { ...EMPTY_SHOPIFY_PRODUCT_DETAILS };
  for (const field of SHOPIFY_PRODUCT_DETAIL_FIELDS) {
    const entry = source[field];
    if (entry === undefined || entry === null) continue;
    if (typeof entry !== "string") {
      throw new Error(`The Shopify product details field "${field}" must be text.`);
    }
    details[field] = entry;
  }
  return details;
}

export function serializeShopifyProductDetails(
  details: ShopifyProductDetails,
): string {
  return JSON.stringify(
    Object.fromEntries(
      SHOPIFY_PRODUCT_DETAIL_FIELDS.map((field) => [
        field,
        details[field].trim(),
      ]),
    ),
  );
}

export function hasShopifyProductDetails(details: ShopifyProductDetails): boolean {
  return SHOPIFY_PRODUCT_DETAIL_FIELDS.some((field) => details[field].trim());
}

import { Router, type IRouter } from "express";
import {
  AddShopifyCartLineBody,
  GetShopifyCartQueryParams,
  GetShopifyCustomerAccountResponse,
  RemoveShopifyCartLinesBody,
  UpdateShopifyCartBuyerIdentityBody,
  UpdateShopifyCartDiscountCodesBody,
  UpdateShopifyCartLinesBody,
} from "@workspace/api-zod";
import {
  getShopifyCustomerAccountUrl,
  shopifyStorefrontRequest,
} from "../lib/shopifyStorefrontClient";
import { logger } from "../lib/logger";

type ShopifyImage = {
  url: string;
  altText: string | null;
};

type ShopifyVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  price: { amount: string; currencyCode: string };
  selectedOptions: Array<{ name: string; value: string }>;
};

type ShopifyProduct = {
  id: string;
  createdAt: string;
  handle: string;
  title: string;
  description: string;
  productType: string;
  tags: string[];
  fabric: { value: string } | null;
  regionalHandloom: { value: string } | null;
  craftTechnique: { value: string } | null;
  region: { value: string } | null;
  colour: { value: string } | null;
  collections: { nodes: Array<{ id: string; handle: string; title: string }> };
  images: { nodes: ShopifyImage[] };
  variants: { nodes: ShopifyVariant[] };
};

type ShopifyProductsPage = {
  products: {
    nodes: ShopifyProduct[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

type ShopifyAvailableCountry = {
  isoCode: string;
  name: string;
};

type ShopifyCartMerchandise = {
  id: string;
  title: string;
  sku: string | null;
  availableForSale: boolean;
  price: ShopifyMoney;
  selectedOptions: Array<{ name: string; value: string }>;
  product: {
    title: string;
    handle: string;
    description: string;
    tags: string[];
    featuredImage: ShopifyImage | null;
  };
};

type ShopifyCartDeliveryOption = {
  title: string | null;
  deliveryMethodType: string;
  estimatedCost: ShopifyMoney;
};

export type ShopifyCartNode = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: {
    subtotalAmount: ShopifyMoney;
    totalAmount: ShopifyMoney;
    totalTaxAmount?: ShopifyMoney | null;
  };
  deliveryGroups?: {
    nodes: Array<{
      deliveryOptions: ShopifyCartDeliveryOption[];
      selectedDeliveryOption: ShopifyCartDeliveryOption | null;
    }>;
  } | null;
  discountCodes: Array<{ code: string; applicable: boolean }>;
  lines: {
    nodes: Array<{
      id: string;
      quantity: number;
      cost: { subtotalAmount: ShopifyMoney; totalAmount: ShopifyMoney };
      merchandise: ShopifyCartMerchandise | null;
    }>;
  };
};

type ShopifyCartMutationResult = {
  cart: ShopifyCartNode | null;
  userErrors: Array<{ message: string }>;
};

class IndiaMarketUnavailableError extends Error {
  constructor() {
    super("This store is not currently set up to deliver to India. Please contact the store owner.");
    this.name = "IndiaMarketUnavailableError";
  }
}

type ShopifyVariantForCart = {
  id: string;
  availableForSale: boolean;
  product: { title: string; description: string; tags: string[] } | null;
};

type ShopifyCartApiResponse = {
  id: string;
  checkoutUrl: string | null;
  totalQuantity: number;
  subtotalAmount: string;
  discountAmount: string;
  totalAmount: string;
  currencyCode: string;
  shippingEstimate: {
    amount: string;
    currencyCode: string;
    method: string;
    basis: "selected" | "lowest_available";
  } | null;
  estimatedTotalAmount: string | null;
  discountCodes: Array<{ code: string; applicable: boolean }>;
  lines: Array<{
    id: string;
    merchandiseId: string;
    productHandle: string;
    productTitle: string;
    variantTitle: string;
    quantity: number;
    unitPrice: string;
    currencyCode: string;
    availableForSale: boolean;
    isDemo: boolean;
    image: ShopifyImage | null;
  }>;
};

const SHOPIFY_PRODUCTS_QUERY = `#graphql
  query ChenethaProducts($after: String) @inContext(country: IN) {
    products(first: 50, after: $after) {
      nodes {
        id
        createdAt
        handle
        title
        description
        productType
        tags
        fabric: metafield(namespace: "chenetha", key: "fabric") { value }
        regionalHandloom: metafield(namespace: "chenetha", key: "regional_handloom") { value }
        craftTechnique: metafield(namespace: "chenetha", key: "craft_technique") { value }
        region: metafield(namespace: "chenetha", key: "region") { value }
        colour: metafield(namespace: "chenetha", key: "colour") { value }
        collections(first: 50) {
          nodes { id handle title }
        }
        images(first: 6) {
          nodes { url altText }
        }
        variants(first: 20) {
          nodes {
            id
            title
            availableForSale
            price { amount currencyCode }
            selectedOptions { name value }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CART_FIELDS = `#graphql
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount { amount currencyCode }
    totalAmount { amount currencyCode }
    totalTaxAmount { amount currencyCode }
  }
  discountCodes { code applicable }
  lines(first: 50) {
    nodes {
      id
      quantity
      cost {
        subtotalAmount { amount currencyCode }
        totalAmount { amount currencyCode }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          sku
          availableForSale
          price { amount currencyCode }
          selectedOptions { name value }
          product {
            title
            handle
            description
            tags
            featuredImage { url altText }
          }
        }
      }
    }
  }
`;

const SHOPIFY_CART_MARKET = `#graphql
  query ShopifyCartMarket {
    localization {
      availableCountries { isoCode name }
    }
  }
`;

const SHOPIFY_CART_QUERY = `#graphql
  query ShopifyCart($cartId: ID!) @inContext(country: IN) {
    cart(id: $cartId) {
      ${CART_FIELDS}
    }
  }
`;

const SHOPIFY_CART_SHIPPING_ESTIMATE_QUERY = `#graphql
  query ShopifyCartShippingEstimate($cartId: ID!) {
    cart(id: $cartId) {
      id
      deliveryGroups(first: 20) {
        nodes {
        selectedDeliveryOption {
          title
          deliveryMethodType
          estimatedCost { amount currencyCode }
        }
        deliveryOptions {
          title
          deliveryMethodType
          estimatedCost { amount currencyCode }
        }
        }
      }
    }
  }
`;

const SHOPIFY_CART_CREATE = `#graphql
  mutation CreateShopifyCart($variantId: ID!, $quantity: Int!) {
    cartCreate(input: {
      buyerIdentity: { countryCode: IN }
      lines: [{ merchandiseId: $variantId, quantity: $quantity }]
    }) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_CART_ADD_LINES = `#graphql
  mutation AddShopifyCartLines($cartId: ID!, $variantId: ID!, $quantity: Int!) {
    cartLinesAdd(
      cartId: $cartId
      lines: [{ merchandiseId: $variantId, quantity: $quantity }]
    ) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_CART_UPDATE_LINES = `#graphql
  mutation UpdateShopifyCartLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_CART_REMOVE_LINES = `#graphql
  mutation RemoveShopifyCartLines($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_CART_DISCOUNT_CODES_UPDATE = `#graphql
  mutation UpdateShopifyCartDiscountCodes($cartId: ID!, $discountCodes: [String!]!) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_CART_BUYER_IDENTITY_UPDATE = `#graphql
  mutation UpdateShopifyCartBuyerIdentity($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_CART_DELIVERY_ADDRESSES_REPLACE = `#graphql
  mutation ReplaceShopifyCartDeliveryAddress($cartId: ID!, $addresses: [CartSelectableAddressInput!]!) {
    cartDeliveryAddressesReplace(cartId: $cartId, addresses: $addresses) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_VARIANT_FOR_CART = `#graphql
  query ShopifyVariantForCart($id: ID!) @inContext(country: IN) {
    node(id: $id) {
      ... on ProductVariant {
        id
        availableForSale
        product { title description tags }
      }
    }
  }
`;

const CATALOG_CACHE_TTL_MS = 60_000;
let cachedCatalog:
  | {
      products: ShopifyProduct[];
      totalProducts: number;
      expiresAt: number;
    }
  | undefined;

export function invalidateShopifyCatalog(): void {
  cachedCatalog = undefined;
}

const isDemoListing = (product: {
  title: string;
  description: string;
  tags: string[];
}) =>
  /\b(demo|sample|template)\b/i.test(
    [product.title, product.description, ...product.tags].join(" "),
  ) || /\[[^\]]+\]/.test(`${product.title} ${product.description}`);

function scaledMoneyAmount(amount: string, scale: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!match) throw new Error(`Invalid Shopify money amount: ${amount}`);
  const fraction = match[3] ?? "";
  const value = BigInt(`${match[1]}${match[2]}${fraction.padEnd(scale, "0")}`);
  return value;
}

function formatScaledMoneyAmount(amount: bigint, scale: number): string {
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  if (scale === 0) return `${negative ? "-" : ""}${absolute}`;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function getCartMerchandiseSubtotalAmount(cart: ShopifyCartNode): string {
  const amounts = cart.lines.nodes.map((line) => line.cost.subtotalAmount.amount);
  if (amounts.length === 0) return cart.cost.subtotalAmount.amount;
  const scale = Math.max(
    0,
    ...amounts.map((amount) => amount.split(".")[1]?.length ?? 0),
  );
  const subtotal = amounts.reduce(
    (sum, amount) => sum + scaledMoneyAmount(amount, scale),
    0n,
  );
  return formatScaledMoneyAmount(subtotal, scale);
}

function getCartDiscountAmount(cart: ShopifyCartNode): string {
  const amounts = cart.lines.nodes.flatMap(({ cost }) => [
    cost.subtotalAmount.amount,
    cost.totalAmount.amount,
  ]);
  const scale = Math.max(
    0,
    ...amounts.map((amount) => amount.split(".")[1]?.length ?? 0),
  );
  const discounted = cart.lines.nodes.reduce(
    (sum, line) =>
      sum +
      scaledMoneyAmount(line.cost.subtotalAmount.amount, scale) -
      scaledMoneyAmount(line.cost.totalAmount.amount, scale),
    0n,
  );
  return formatScaledMoneyAmount(discounted, scale);
}

function getCartShippingEstimate(
  cart: ShopifyCartNode,
): ShopifyCartApiResponse["shippingEstimate"] {
  const groups = cart.deliveryGroups?.nodes ?? [];
  if (!groups.length) return null;

  const chosenOptions = groups.map((group) => {
    const selected = group.selectedDeliveryOption;
    if (selected?.deliveryMethodType === "SHIPPING") {
      return { option: selected, selected: true };
    }

    const options = group.deliveryOptions.filter(
      (option) => option.deliveryMethodType === "SHIPPING",
    );
    if (!options.length) return null;

    const scale = Math.max(
      0,
      ...options.map(({ estimatedCost }) => estimatedCost.amount.split(".")[1]?.length ?? 0),
    );
    const lowest = options.reduce((best, option) =>
      scaledMoneyAmount(option.estimatedCost.amount, scale) <
        scaledMoneyAmount(best.estimatedCost.amount, scale)
        ? option
        : best,
    );
    return { option: lowest, selected: false };
  });

  if (chosenOptions.some((choice) => !choice)) return null;
  const chosen = chosenOptions.filter(
    (choice): choice is NonNullable<typeof choice> => choice !== null,
  );
  const currencyCode = chosen[0]?.option.estimatedCost.currencyCode;
  if (!currencyCode || chosen.some((choice) => choice.option.estimatedCost.currencyCode !== currencyCode)) {
    return null;
  }

  const amounts = chosen.map(({ option }) => option.estimatedCost.amount);
  const scale = Math.max(0, ...amounts.map((amount) => amount.split(".")[1]?.length ?? 0));
  const total = amounts.reduce((sum, amount) => sum + scaledMoneyAmount(amount, scale), 0n);
  const methods = [...new Set(chosen.map(
    ({ option }) => option.title?.trim() || "Shipping",
  ))];

  return {
    amount: formatScaledMoneyAmount(total, scale),
    currencyCode,
    method: methods.join(", "),
    basis: chosen.every(({ selected }) => selected) ? "selected" : "lowest_available",
  };
}

function getEstimatedTotalAmount(
  cart: ShopifyCartNode,
  shippingEstimate: ShopifyCartApiResponse["shippingEstimate"],
): string | null {
  if (!shippingEstimate || shippingEstimate.currencyCode !== cart.cost.totalAmount.currencyCode) {
    return null;
  }

  const totalAmount = cart.cost.totalAmount.amount;
  const scale = Math.max(
    totalAmount.split(".")[1]?.length ?? 0,
    shippingEstimate.amount.split(".")[1]?.length ?? 0,
  );
  return formatScaledMoneyAmount(
    scaledMoneyAmount(totalAmount, scale) +
      scaledMoneyAmount(shippingEstimate.amount, scale),
    scale,
  );
}

function createCheckoutUrl(checkoutUrl: string): string {
  const url = new URL(checkoutUrl);
  if (process.env["SHOPIFY_DEV_STORE_PREVIEW"] === "true") {
    url.searchParams.set("channel", "online_store");
  }
  return url.toString();
}

function mapShopifyCart(cart: ShopifyCartNode): ShopifyCartApiResponse {
  const shippingEstimate = getCartShippingEstimate(cart);
  const lines = cart.lines.nodes.map((line) => {
    const merchandise = line.merchandise;
    const product = merchandise?.product;
    const demo = !product || isDemoListing(product);
    return {
      id: line.id,
      merchandiseId: merchandise?.id ?? "",
      productHandle: product?.handle ?? "",
      productTitle: product?.title ?? "Unavailable product",
      variantTitle: merchandise?.title ?? "Unavailable option",
      quantity: line.quantity,
      unitPrice: merchandise?.price.amount ?? "0",
      currencyCode: merchandise?.price.currencyCode ?? cart.cost.subtotalAmount.currencyCode,
      availableForSale: merchandise?.availableForSale ?? false,
      isDemo: demo,
      image: product?.featuredImage ?? null,
    };
  });
  const checkoutAllowed = lines.length > 0 &&
    lines.every((line) => line.availableForSale && !line.isDemo);

  return {
    id: cart.id,
    checkoutUrl: checkoutAllowed ? createCheckoutUrl(cart.checkoutUrl) : null,
    totalQuantity: cart.totalQuantity,
    subtotalAmount: getCartMerchandiseSubtotalAmount(cart),
    discountAmount: getCartDiscountAmount(cart),
    totalAmount: cart.cost.totalAmount.amount,
    currencyCode: cart.cost.subtotalAmount.currencyCode,
    shippingEstimate,
    estimatedTotalAmount: getEstimatedTotalAmount(cart, shippingEstimate),
    discountCodes: cart.discountCodes,
    lines,
  };
}

const INDIA_PROVINCE_CODES: Record<string, string> = {
  "andaman and nicobar islands": "AN",
  "andhra pradesh": "AP",
  "arunachal pradesh": "AR",
  assam: "AS",
  bihar: "BR",
  chandigarh: "CH",
  chhattisgarh: "CG",
  "dadra and nagar haveli and daman and diu": "DN",
  delhi: "DL",
  goa: "GA",
  gujarat: "GJ",
  haryana: "HR",
  "himachal pradesh": "HP",
  "jammu and kashmir": "JK",
  jharkhand: "JH",
  karnataka: "KA",
  kerala: "KL",
  ladakh: "LA",
  lakshadweep: "LD",
  "madhya pradesh": "MP",
  maharashtra: "MH",
  manipur: "MN",
  meghalaya: "ML",
  mizoram: "MZ",
  nagaland: "NL",
  odisha: "OD",
  puducherry: "PY",
  punjab: "PB",
  rajasthan: "RJ",
  sikkim: "SK",
  "tamil nadu": "TN",
  telangana: "TS",
  tripura: "TR",
  "uttar pradesh": "UP",
  uttarakhand: "UK",
  "west bengal": "WB",
};

function shopifyIndiaProvinceCode(state: string): string {
  const normalized = state.trim().toLowerCase().replace(/\s+/g, " ");
  return INDIA_PROVINCE_CODES[normalized] ?? state.trim().toUpperCase();
}

async function getShopifyCart(cartId: string) {
  const result = await shopifyStorefrontRequest<{ cart: ShopifyCartNode | null }>(
    SHOPIFY_CART_QUERY,
    { cartId },
  );
  return result.cart;
}

export async function getShopifyCheckoutCart(cartId: string) {
  return getShopifyCart(cartId);
}

export async function removePurchasedCartQuantities(input: {
  cartId: string;
  lines: Array<{ id: string; quantity: number }>;
}): Promise<void> {
  if (!input.lines.length) return;
  const cart = await getShopifyCart(input.cartId);
  if (!cart) return;

  const purchased = new Map<string, number>();
  for (const line of input.lines) {
    if (line.id && Number.isInteger(line.quantity) && line.quantity > 0) {
      purchased.set(line.id, (purchased.get(line.id) ?? 0) + line.quantity);
    }
  }
  const updates = cart.lines.nodes.flatMap((line) => {
    const quantity = purchased.get(line.id);
    if (!quantity) return [];
    return [{ id: line.id, quantity: Math.max(0, line.quantity - quantity) }];
  });
  if (!updates.length) return;

  const result = await shopifyStorefrontRequest<{
    cartLinesUpdate: ShopifyCartMutationResult;
  }>(SHOPIFY_CART_UPDATE_LINES, { cartId: input.cartId, lines: updates });
  if (result.cartLinesUpdate.userErrors.length) {
    throw new Error("Shopify rejected the purchased cart quantity cleanup.");
  }
  if (!result.cartLinesUpdate.cart) {
    throw new Error("Shopify did not return the updated cart after checkout.");
  }
}

export class ShopifyCheckoutInputError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "ShopifyCheckoutInputError";
  }
}

export async function prepareShopifyCheckoutCart(data: {
  cartId: string;
  email: string;
  phone?: string;
  deliveryAddress: {
    recipient: string;
    street: string;
    address2?: string;
    city: string;
    state?: string;
    pin: string;
    countryCode: string;
  };
}): Promise<ShopifyCartNode> {
  const countryCode = data.deliveryAddress.countryCode.toUpperCase();
  const availableCountries = await getAvailableCountries();
  if (!availableCountries.some((country) => country.isoCode === countryCode)) {
    throw new ShopifyCheckoutInputError(
      "This store is not currently set up to deliver to the selected country.",
      409,
    );
  }
  const [firstName, ...lastNameParts] = data.deliveryAddress.recipient.trim().split(/\s+/);
  const lastName = lastNameParts.join(" ");
  const identityResult = await shopifyStorefrontRequest<{
    cartBuyerIdentityUpdate: ShopifyCartMutationResult;
  }>(SHOPIFY_CART_BUYER_IDENTITY_UPDATE, {
    cartId: data.cartId,
    buyerIdentity: {
      countryCode,
      email: data.email.trim(),
      ...(data.phone ? { phone: data.phone.trim() } : {}),
    },
  });
  if (identityResult.cartBuyerIdentityUpdate.userErrors.length) {
    throw new ShopifyCheckoutInputError(
      identityResult.cartBuyerIdentityUpdate.userErrors[0].message,
      400,
    );
  }
  if (!identityResult.cartBuyerIdentityUpdate.cart) {
    throw new ShopifyCheckoutInputError(
      "This Shopify cart has expired or could not be found.",
      404,
    );
  }

  const addressResult = await shopifyStorefrontRequest<{
    cartDeliveryAddressesReplace: ShopifyCartMutationResult;
  }>(SHOPIFY_CART_DELIVERY_ADDRESSES_REPLACE, {
    cartId: data.cartId,
    addresses: [{
      address: {
        deliveryAddress: {
          firstName,
          ...(lastName ? { lastName } : {}),
          address1: data.deliveryAddress.street.trim(),
          ...(data.deliveryAddress.address2?.trim()
            ? { address2: data.deliveryAddress.address2.trim() }
            : {}),
          city: data.deliveryAddress.city.trim(),
          ...(data.deliveryAddress.state?.trim()
            ? {
                provinceCode: countryCode === "IN"
                  ? shopifyIndiaProvinceCode(data.deliveryAddress.state)
                  : data.deliveryAddress.state.trim(),
              }
            : {}),
          zip: data.deliveryAddress.pin.trim(),
          countryCode,
          ...(data.phone ? { phone: data.phone.trim() } : {}),
        },
      },
      selected: true,
      oneTimeUse: true,
    }],
  });
  if (addressResult.cartDeliveryAddressesReplace.userErrors.length) {
    throw new ShopifyCheckoutInputError(
      addressResult.cartDeliveryAddressesReplace.userErrors[0].message,
      400,
    );
  }
  if (!addressResult.cartDeliveryAddressesReplace.cart) {
    throw new ShopifyCheckoutInputError(
      "This Shopify cart has expired or could not be found.",
      404,
    );
  }

  const updatedCart = addressResult.cartDeliveryAddressesReplace.cart;
  try {
    const shippingResult = await shopifyStorefrontRequest<{
      cart: Pick<ShopifyCartNode, "id" | "deliveryGroups"> | null;
    }>(SHOPIFY_CART_SHIPPING_ESTIMATE_QUERY, { cartId: data.cartId });
    if (shippingResult.cart) {
      return { ...updatedCart, deliveryGroups: shippingResult.cart.deliveryGroups };
    }
  } catch {
    // Shopify carrier rates are not used for the checkout quote.
  }
  return updatedCart;
}

async function assertIndiaMarketAvailable() {
  const result = await shopifyStorefrontRequest<{
    localization: { availableCountries: ShopifyAvailableCountry[] };
  }>(SHOPIFY_CART_MARKET);
  if (!result.localization.availableCountries.some((country) => country.isoCode === "IN")) {
    throw new IndiaMarketUnavailableError();
  }
}

export async function getAvailableCountries(): Promise<ShopifyAvailableCountry[]> {
  const result = await shopifyStorefrontRequest<{
    localization: { availableCountries: ShopifyAvailableCountry[] };
  }>(SHOPIFY_CART_MARKET);
  return result.localization.availableCountries
    .filter((country) => /^[A-Z]{2}$/.test(country.isoCode) && country.name.trim())
    .sort((left, right) => left.name.localeCompare(right.name));
}

function respondToCartError(res: import("express").Response, error: unknown) {
  if (!(error instanceof IndiaMarketUnavailableError)) return false;
  res.setHeader("Cache-Control", "no-store");
  res.status(409).json({ error: error.message });
  return true;
}

async function validatePurchasableVariant(variantId: string) {
  const result = await shopifyStorefrontRequest<{
    node: ShopifyVariantForCart | null;
  }>(SHOPIFY_VARIANT_FOR_CART, { id: variantId });
  const variant = result.node;
  if (!variant || !("product" in variant) || !variant.product) {
    return { error: "That Shopify product option could not be found." };
  }
  if (isDemoListing(variant.product)) {
    return {
      error: "This listing is marked as demo content. Replace its Shopify title, description, tags, and photos before selling it.",
    };
  }
  if (!variant.availableForSale) {
    return { error: "This product option is currently unavailable." };
  }
  return { variant };
}

async function getStorefrontCatalog() {
  if (cachedCatalog && Date.now() < cachedCatalog.expiresAt) {
    return cachedCatalog;
  }

  const allProducts: ShopifyProduct[] = [];
  let after: string | null = null;
  let hasNextPage = true;
  const seenCursors = new Set<string>();
  while (hasNextPage) {
    const result: ShopifyProductsPage = await shopifyStorefrontRequest<ShopifyProductsPage>(
      SHOPIFY_PRODUCTS_QUERY,
      { after },
    );
    allProducts.push(...result.products.nodes);
    hasNextPage = result.products.pageInfo.hasNextPage;
    after = result.products.pageInfo.endCursor;
    if (hasNextPage && (!after || seenCursors.has(after))) {
      throw new Error("Shopify returned an invalid product catalog cursor.");
    }
    if (after) seenCursors.add(after);
  }

  const catalog = {
    products: allProducts,
    totalProducts: allProducts.length,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  };
  cachedCatalog = catalog;
  return catalog;
}

const router: IRouter = Router();

router.get("/shopify/products", async (_req, res) => {
  try {
    const catalog = await getStorefrontCatalog();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      products: catalog.products.map((product) => ({
        id: product.id,
        createdAt: product.createdAt,
        handle: product.handle,
        title: product.title,
        description: product.description,
        productType: product.productType,
        tags: product.tags,
        attributes: {
          fabric: product.fabric?.value ?? null,
          regionalHandloom: product.regionalHandloom?.value ?? null,
          craftTechnique: product.craftTechnique?.value ?? null,
          region: product.region?.value ?? null,
          colour: product.colour?.value ?? null,
        },
        collections: product.collections.nodes,
        images: product.images.nodes,
        variants: product.variants.nodes.map((variant) => ({
          id: variant.id,
          title: variant.title,
          availableForSale: variant.availableForSale,
          price: variant.price.amount,
          currencyCode: variant.price.currencyCode,
          selectedOptions: variant.selectedOptions,
        })),
      })),
      totalPublishedProducts: catalog.totalProducts,
      truncated: false,
    });
  } catch (error) {
    logger.error({ err: error }, "Shopify catalog could not be loaded");
    res.status(502).json({ error: "Shopify products are temporarily unavailable." });
  }
});

router.get("/shopify/customer-account", async (req, res): Promise<void> => {
  try {
    const accountUrl = await getShopifyCustomerAccountUrl();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(GetShopifyCustomerAccountResponse.parse({ accountUrl }));
  } catch (error) {
    req.log.error({ err: error }, "Shopify customer account URL could not be loaded");
    res.status(502).json({
      error: "The Shopify account page is temporarily unavailable.",
    });
  }
});

router.get("/shopify/countries", async (_req, res): Promise<void> => {
  try {
    const countries = await getAvailableCountries();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ countries });
  } catch {
    res.status(502).json({ error: "Available delivery countries could not be loaded. Please try again." });
  }
});

router.get("/shopify/cart", async (req, res): Promise<void> => {
  const params = GetShopifyCartQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "A valid Shopify cart identifier is required." });
    return;
  }
  try {
    await assertIndiaMarketAvailable();
    const cart = await getShopifyCart(params.data.cartId);
    if (!cart) {
      res.status(404).json({ error: "This Shopify cart has expired or could not be found." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(mapShopifyCart(cart));
  } catch (error) {
    if (respondToCartError(res, error)) return;
    logger.error({ err: error }, "Shopify cart could not be loaded");
    res.status(502).json({ error: "Your Shopify bag could not be loaded. Please try again." });
  }
});

router.post("/shopify/cart", async (req, res): Promise<void> => {
  const body = AddShopifyCartLineBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose a valid product option and quantity." });
    return;
  }
  if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(body.data.merchandiseId)) {
    res.status(400).json({ error: "The Shopify product option is invalid." });
    return;
  }
  try {
    const purchasable = await validatePurchasableVariant(body.data.merchandiseId);
    if ("error" in purchasable) {
      res.status(400).json({ error: purchasable.error });
      return;
    }
    await assertIndiaMarketAvailable();

    const result = body.data.cartId
      ? await shopifyStorefrontRequest<{ cartLinesAdd: ShopifyCartMutationResult }>(
          SHOPIFY_CART_ADD_LINES,
          {
            cartId: body.data.cartId,
            variantId: body.data.merchandiseId,
            quantity: body.data.quantity,
          },
        ).then((data) => data.cartLinesAdd)
      : await shopifyStorefrontRequest<{ cartCreate: ShopifyCartMutationResult }>(
          SHOPIFY_CART_CREATE,
          {
            variantId: body.data.merchandiseId,
            quantity: body.data.quantity,
          },
        ).then((data) => data.cartCreate);

    if (result.userErrors.length) {
      res.status(400).json({ error: result.userErrors[0].message });
      return;
    }
    if (!result.cart) {
      res.status(502).json({ error: "Shopify did not return an updated bag." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(mapShopifyCart(result.cart));
  } catch (error) {
    if (respondToCartError(res, error)) return;
    logger.error({ err: error }, "Shopify cart line could not be added");
    res.status(502).json({ error: "This product could not be added to your Shopify bag. Please try again." });
  }
});

router.patch("/shopify/cart", async (req, res): Promise<void> => {
  const body = UpdateShopifyCartLinesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose a valid Shopify bag and quantity." });
    return;
  }
  try {
    await assertIndiaMarketAvailable();
    const result = await shopifyStorefrontRequest<{
      cartLinesUpdate: ShopifyCartMutationResult;
    }>(SHOPIFY_CART_UPDATE_LINES, {
      cartId: body.data.cartId,
      lines: body.data.lines,
    });
    if (result.cartLinesUpdate.userErrors.length) {
      res.status(400).json({ error: result.cartLinesUpdate.userErrors[0].message });
      return;
    }
    if (!result.cartLinesUpdate.cart) {
      res.status(404).json({ error: "This Shopify cart has expired or could not be found." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(mapShopifyCart(result.cartLinesUpdate.cart));
  } catch (error) {
    if (respondToCartError(res, error)) return;
    logger.error({ err: error }, "Shopify cart quantities could not be updated");
    res.status(502).json({ error: "Your Shopify bag could not be updated. Please try again." });
  }
});

router.post("/shopify/cart/remove-lines", async (req, res): Promise<void> => {
  const body = RemoveShopifyCartLinesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose a valid Shopify bag and product line." });
    return;
  }
  try {
    await assertIndiaMarketAvailable();
    const result = await shopifyStorefrontRequest<{
      cartLinesRemove: ShopifyCartMutationResult;
    }>(SHOPIFY_CART_REMOVE_LINES, {
      cartId: body.data.cartId,
      lineIds: [...new Set(body.data.lineIds)],
    });
    if (result.cartLinesRemove.userErrors.length) {
      res.status(400).json({ error: result.cartLinesRemove.userErrors[0].message });
      return;
    }
    if (!result.cartLinesRemove.cart) {
      res.status(404).json({ error: "This Shopify cart has expired or could not be found." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(mapShopifyCart(result.cartLinesRemove.cart));
  } catch (error) {
    if (respondToCartError(res, error)) return;
    logger.error({ err: error }, "Shopify cart lines could not be removed");
    res.status(502).json({ error: "Your Shopify bag could not be updated. Please try again." });
  }
});

router.post("/shopify/cart/discount-codes", async (req, res): Promise<void> => {
  const body = UpdateShopifyCartDiscountCodesBody.safeParse(req.body);
  if (!body.success || body.data.discountCodes.some((code) => !code.trim())) {
    res.status(400).json({ error: "Enter a valid discount code." });
    return;
  }
  const discountCodes = [...new Set(body.data.discountCodes.map((code) => code.trim()))];
  try {
    await assertIndiaMarketAvailable();
    const result = await shopifyStorefrontRequest<{
      cartDiscountCodesUpdate: ShopifyCartMutationResult;
    }>(SHOPIFY_CART_DISCOUNT_CODES_UPDATE, {
      cartId: body.data.cartId,
      discountCodes,
    });
    if (result.cartDiscountCodesUpdate.userErrors.length) {
      res.status(400).json({ error: result.cartDiscountCodesUpdate.userErrors[0].message });
      return;
    }
    if (!result.cartDiscountCodesUpdate.cart) {
      res.status(404).json({ error: "This Shopify cart has expired or could not be found." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(mapShopifyCart(result.cartDiscountCodesUpdate.cart));
  } catch (error) {
    if (respondToCartError(res, error)) return;
    logger.error({ err: error }, "Shopify cart discount codes could not be updated");
    res.status(502).json({ error: "Shopify could not apply this discount code. Please try again." });
  }
});

router.post("/shopify/cart/buyer-identity", async (req, res): Promise<void> => {
  const body = UpdateShopifyCartBuyerIdentityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter valid contact and delivery details." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const updatedCart = await prepareShopifyCheckoutCart(body.data);
    res.json(mapShopifyCart(updatedCart));
  } catch (error) {
    if (error instanceof ShopifyCheckoutInputError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    // Cart identity contains personal details; keep them out of server logs.
    res.status(502).json({ error: "Shopify could not prepare your saved details for checkout. Please try again." });
  }
});

export default router;

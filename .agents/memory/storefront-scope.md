---
name: Storefront scope
description: Client requirements for Chenetha by Koushikii and future commerce integration boundaries.
---
The user is designing the complete customer-facing storefront for their client's handloom brand, Chenetha by Koushikii. Use the supplied client demo designs and organisation logo; follow the logo's colour theme.

**Why:** The user explicitly requested a complete storefront design based on their client's references and logo.

**How to apply:** Keep customer browsing, purchase and after-purchase pages visually consistent. Shopify is now the selected commerce system for physical handloom products; do not treat prototype flows as live integrations.

The merchant dashboard is for the handover client who runs this business, not for shoppers. It serves only the current connected Shopify store, not multiple client stores.

**Why:** The user explicitly clarified “the client for whom I will handover this website so they can run the business” and selected the current-store-only setup.

**How to apply:** Keep merchant access separate from customer navigation, authorize store-changing actions on the server, and keep Shopify authoritative for commerce. Public browsing must remain accessible even during a merchant session; signing in must not replace the storefront home with an admin page.

The client's Shopify store (`gtnbsw-x3.myshopify.com`) is now the connected production store. Keep the user's Replit-provisioned development store separate; never reuse its Storefront API token for client commerce.

**Why:** On November 5, 2026, the user connected the client's account and approved switching Railway to it. The client-specific Storefront token and store domain were deployed.

**How to apply:** Keep product data and checkout tied to the client store. Publish website products to the Online Store channel. Do not seed demo items or modify the client catalog without explicit approval.

The merchant selected address-based Shiprocket quotes for the custom storefront checkout and confirmed that the account offers international shipping. Pack each sold unit separately; the confirmed default parcel is 1 kg and 35 × 25 × 8 cm, with pickup postcode 500007. The merchant confirmed Shiprocket export-purpose value `3` and invoice terms `FOB`. Domestic and international prices must come from live provider quotes.

**Why:** The merchant later replaced the earlier Shopify-managed-rate approach, confirmed international service, and specified how each packet is packed.

**How to apply:** Send the actual weight and dimensions to Shiprocket and use returned serviceability and rates; do not hardcode prices. Use the confirmed export purpose and invoice terms in international quote requests. Volumetric weight is derived from the supplied dimensions by the provider.

The client does not yet have all international-export documents and will enable international shipping in Shiprocket after receiving them. Defer the app's international configuration until the required documents and product classifications are available.

**Why:** The user confirmed on 2026-11-09 that international setup should wait for the client's documents and Shiprocket activation.

**How to apply:** Keep international checkout unavailable until the client enables it in Shiprocket and supplies verified export settings and the correct HSN for each product. Do not apply the confirmed HSN for one representative saree to the whole catalog.

The user wants sign-in and sign-out for both shoppers and the merchant. Shopper site accounts use Replit-managed Clerk; Shopify checkout, payments, shipping and order identity remain separate. Phone sign-in is not supported by the managed Clerk integration.

**Why:** The user explicitly chose “Shoppers and merchant” and asked for email or phone with password and password recovery.

**How to apply:** Make shopper account access visible from the storefront and provide logout, while preserving the merchant email allowlist for admin mutations. Never imply that a Clerk login is a Shopify customer account or that it automatically links Shopify order history.

The user selected sarees as the initial Shopify catalog category.

**Why:** The user chose Shopify and answered that the storefront should sell sarees.

**How to apply:** Use published Shopify product and variant IDs for the live catalog and checkout. Do not create products or inventory without real product details and explicit approval.

Published Shopify sarees replace the storefront's sample product cards; drafts are not visible through the buyer catalog. Sample pieces remain only as a fallback when Shopify has no published sarees. Demo or placeholder products must be clearly marked and blocked from purchase, including by server-side cart validation. The Chenetha checkout collects buyer contact and delivery details and hands payment to Cashfree's hosted page; Shopify remains authoritative for products, inventory, and the resulting order. The site must never collect card details.

**Why:** The user selected Cashfree for the branded checkout while keeping Shopify as the commerce record, and wants products entered in Shopify to appear without risking accidental sales of placeholders.

**How to apply:** Validate product availability and demo markers on the server before adding a cart line. Use a verified Cashfree payment plus idempotent Shopify order creation; never claim payment from the browser return alone or collect/store card details.

Before Cashfree payment, the custom checkout must show the current item subtotal, discounts, a live address-specific Shiprocket quote, currency, and final total. The client says they do not have a GST number and wants listed product prices to be final, with only carrier-calculated shipping added; do not show or collect a separate checkout tax amount. Address, cart, or parcel changes invalidate the quote; it expires after a short period. State that destination duties and customs fees may be excluded from carrier pricing.

**Why:** The merchant asked for a website checkout with a current delivery quote and full total before payment, and clarified that final catalog prices plus shipping are the intended checkout amount.

**How to apply:** Revalidate the current Shopify cart and address before creating a Cashfree session. Use Shopify line prices as final item amounts, add the live shipping quote only, and record the matching Shopify order as non-taxable for this custom checkout. Fail closed when no valid provider quote exists. Do not change Shopify tax settings or infer legal tax obligations from GST registration status. Do not promise a fixed international price, delivery time, duty, or tax.

Shopify currency is authoritative. The current checkout implementation accepts INR only; international payment activation, supported buyer currencies, and settlement remain unconfirmed for production.

**Why:** The merchant requested a safe sandbox implementation; no live Cashfree activation or settlement behavior has been approved or verified.

**How to apply:** Display the currency Shopify returns and stop checkout when it is not INR. Keep Cashfree sandbox as the default; require explicit live activation and separate production credentials before real charges or carrier bookings.

The user explicitly rejected a modern-looking storefront and repeatedly emphasized that the design should resemble Indian culture very deeply, especially South Indian culture. Render and visually inspect supplied HTML references, not only extract their text. Preserve their traditional motifs and page structure while applying the organisation logo colours.

**Why:** The user corrected the first design because it reinterpreted the HTML content without inspecting its rendered appearance.

**How to apply:** Home needs distinct bestselling, premium, new-arrival and client-review sections; an illustrated three-stage making lifecycle (yarn preparation, colour and weaving); and backgrounds inspired by regional weaving motifs. About Us needs the brand's origin and philosophy, without inventing founder history or actual maker identities.

The client requested a single floating WhatsApp order button across the storefront screens, not repeated in-page or footer banners.

**Why:** The user explicitly asked to remove WhatsApp banners everywhere and use only an overlay button.

**How to apply:** Keep WhatsApp ordering as a shared floating control on storefront pages; do not add page-specific WhatsApp banners or footer links.

The official Instagram profile supplied for Chenetha by Koushikii is https://www.instagram.com/chenetha_by_koushikii/.

**Why:** The user supplied this profile and asked for it on the Contact Us page.

**How to apply:** Use this exact URL for the brand's social link.

Keep only Home, Collections, Product, Our Story, Wishlist, Cart, Checkout, Confirmation, Account, Orders, Contact, Customer Care and Saree Care for now, plus a separate logged-in Profile preview.

**Why:** The user explicitly narrowed the page list and requested a logged-in profile design; this supersedes the earlier request for Blog navigation.

**How to apply:** Remove other standalone pages from the canvas and navigation. Regional exploration on Home must lead to sarees from that selected region only, never silently show all regions. Use useful factual copy without inventing missing client business facts.

The intended audience includes an older customer who only knows Telugu. English is the default; Telugu and Hindi should also be available.

**Why:** The user explicitly identified this customer need and requested a language selector that updates the website content.

**How to apply:** Keep language selection easy to find, make Telugu script readable, and translate static and dynamic customer-facing content—including product names, weave names, and state/region labels—not just navigation.

The Home customer-photo carousel has no approved review text yet; do not invent praise or attribute fabricated endorsements to the named customers.

**Why:** The user chose a “Review text pending” placeholder because no customer quotes were supplied.

**How to apply:** Replace the placeholder only with exact, approved customer words; do not create customer endorsements or ratings.

The client's designated patented brand red is `#B22222`; use it consistently wherever the storefront uses brand red.

**Why:** The user explicitly identified this as the company's patented colour and asked to replace the site's previous red.

**How to apply:** Prefer the shared red token and use `#B22222` for red brand accents and surfaces across storefront pages.

Shoppers should be able to browse the storefront and manage a guest bag without signing in. Require Clerk sign-in when starting checkout or using Buy Now, and for private order/profile pages. Preserve the guest Shopify cart through the sign-in return; do not create a separate account-cart merge without an explicit product decision.

**Why:** The user requested a guest-first storefront because Shopify's shipping and payment setup is not the desired flow; checkout and private account data still need shopper authentication.

**How to apply:** Keep catalog, product, wishlist, and cart routes public. Gate checkout and private account routes in the storefront and independently require the authenticated Clerk user on checkout quote/payment/status and shopper-data APIs. Keep the existing Shopify cart ID through redirects.

Use the Home page's Kanjeevaram-inspired motif across storefront backgrounds. Use cream-white kolam linework on brand red for hero and footer dividers on every page.

**Why:** The user explicitly asked for one shared background pattern, then specified cream-white kolam dividers on the same red as the hero/footer across the whole site.

**How to apply:** Keep both treatments in shared storefront styles so every customer-facing page uses the same treatment.

The handover client wants one merchant workspace for Shopify products and discounts plus homepage hero slides, fabric/weave thumbnails, approved customer voices, and video posts.

**Why:** The user explicitly asked for these controls so the client can run this single-store storefront without working directly in Shopify for everyday site content.

**How to apply:** Keep Shopify authoritative for products, prices, discounts, checkout, shipping, and payments. Use the merchant workspace for uploaded site media and editorial content; publish only exact customer quotes the client has approved.

Draft content previews must stay inside the authorized merchant workspace, render without saving or publishing, and never create a public preview URL. Unpublished media must not be retrievable through public media routes.

**Why:** The user’s preview task requires real storefront previews for every content type while ensuring drafts stay private and publication remains explicit.

**How to apply:** Render the current editor state with shared storefront components, keep public content responses filtered to published/approved records, and gate media that has no published reference behind merchant authorization.

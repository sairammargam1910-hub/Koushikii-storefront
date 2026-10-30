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

The user wants sign-in and sign-out for both shoppers and the merchant. Shopper site accounts use Replit-managed Clerk; Shopify checkout, payments, shipping and order identity remain separate. Phone sign-in is not supported by the managed Clerk integration.

**Why:** The user explicitly chose “Shoppers and merchant” and asked for email or phone with password and password recovery.

**How to apply:** Make shopper account access visible from the storefront and provide logout, while preserving the merchant email allowlist for admin mutations. Never imply that a Clerk login is a Shopify customer account or that it automatically links Shopify order history.

The user selected sarees as the initial Shopify catalog category.

**Why:** The user chose Shopify and answered that the storefront should sell sarees.

**How to apply:** Use published Shopify product and variant IDs for the live catalog and checkout. Do not create products or inventory without real product details and explicit approval.

Published Shopify sarees replace the storefront's sample product cards; drafts are not visible through the buyer catalog. Sample pieces remain only as a fallback when Shopify has no published sarees. Demo or placeholder products must be clearly marked and blocked from purchase, including by server-side cart validation. Real orders use Shopify Storefront carts and Shopify-hosted checkout; the app must not collect payment or address details.

**Why:** The user wants products entered in Shopify to appear in the storefront and checkout, while avoiding accidental sale of placeholder content or collection of sensitive buyer details in the app.

**How to apply:** Validate product availability and demo markers on the server before adding a cart line. Keep Shopify as the source for variants, prices, shipping, payment, and order status; direct buyers to Shopify-hosted checkout.

Shopify currency is authoritative. Request the India market context for this storefront, but display the currency Shopify returns; never relabel a USD price as INR in app code. Local-currency transaction support depends on Shopify market and payment-provider settings.

**Why:** A Shopify product may display a local currency while checkout still charges the store's base currency, depending on the configured payment gateway.

**How to apply:** Keep currency and payment configuration in Shopify. If the storefront API returns USD, tell the merchant to configure the store or India market currency and confirm that the payment provider can process INR before promising an INR charge.

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

Use the Home page's Kanjeevaram-inspired motif across storefront backgrounds. Use cream-white kolam linework on brand red for hero and footer dividers on every page.

**Why:** The user explicitly asked for one shared background pattern, then specified cream-white kolam dividers on the same red as the hero/footer across the whole site.

**How to apply:** Keep both treatments in shared storefront styles so every customer-facing page uses the same treatment.

The handover client wants one merchant workspace for Shopify products and discounts plus homepage hero slides, fabric/weave thumbnails, approved customer voices, and video posts.

**Why:** The user explicitly asked for these controls so the client can run this single-store storefront without working directly in Shopify for everyday site content.

**How to apply:** Keep Shopify authoritative for products, prices, discounts, checkout, shipping, and payments. Use the merchant workspace for uploaded site media and editorial content; publish only exact customer quotes the client has approved.

Draft content previews must stay inside the authorized merchant workspace, render without saving or publishing, and never create a public preview URL. Unpublished media must not be retrievable through public media routes.

**Why:** The user’s preview task requires real storefront previews for every content type while ensuring drafts stay private and publication remains explicit.

**How to apply:** Render the current editor state with shared storefront components, keep public content responses filtered to published/approved records, and gate media that has no published reference behind merchant authorization.

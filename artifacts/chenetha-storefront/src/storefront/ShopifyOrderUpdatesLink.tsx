import { useGetShopifyCustomerAccount } from "@workspace/api-client-react";
import { ExternalLink } from "lucide-react";

export function ShopifyOrderUpdatesLink() {
  const account = useGetShopifyCustomerAccount();

  if (account.isLoading) {
    return (
      <p className="muted" role="status" data-testid="status-shopify-account-link">
        Loading your order page…
      </p>
    );
  }

  if (account.isError || !account.data) {
    return (
      <p className="muted" role="alert" data-testid="error-shopify-account-link">
        Order updates are temporarily unavailable. Check the email you used at checkout or try again shortly.
      </p>
    );
  }

  return (
    <a
      className="btn"
      href={account.data.accountUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="link-shopify-customer-account"
    >
      View order updates <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}

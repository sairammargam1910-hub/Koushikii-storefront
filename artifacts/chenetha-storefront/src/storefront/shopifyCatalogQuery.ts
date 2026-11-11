import { useQuery } from "@tanstack/react-query";
import {
  getGetShopifyProductsQueryKey,
  getShopifyProducts,
} from "@workspace/api-client-react";

export function useShopifyCatalog(enabled = true) {
  return useQuery({
    queryKey: getGetShopifyProductsQueryKey(),
    queryFn: ({ signal }) => getShopifyProducts({ signal }),
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled,
  });
}

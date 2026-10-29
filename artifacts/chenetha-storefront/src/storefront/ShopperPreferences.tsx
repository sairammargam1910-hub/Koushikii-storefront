import {
  clearShopperPreferences,
  getShopperPreferences,
  updateShopperProfile,
  updateShopperWishlist,
  type ShopperAddress,
  type ShopperPreferencesResponse,
  type ShopperProfile,
} from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WishlistItem = { id: string; qty: number };
export type ShopperProfileData = ShopperProfile;

type ShopperPreferencesContextValue = {
  signedIn: boolean;
  loading: boolean;
  error: Error | null;
  wishlist: WishlistItem[];
  profile: ShopperProfileData;
  saveWishlist: (items: WishlistItem[]) => Promise<void>;
  toggleWishlist: (id: string) => Promise<void>;
  saveProfile: (profile: ShopperProfileData) => Promise<void>;
  clearAll: () => Promise<void>;
  retry: () => Promise<void>;
};

const emptyProfile: ShopperProfileData = {
  name: "",
  email: "",
  phone: "",
  addresses: [],
};
const emptyResponse: ShopperPreferencesResponse = {
  wishlist: [],
  profile: emptyProfile,
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readGuestWishlist(): WishlistItem[] {
  const stored = readJson<unknown>("kq-wish", []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (item): item is WishlistItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as WishlistItem).id === "string",
  );
}

function readGuestProfile(): ShopperProfileData {
  const details = readJson<Partial<Pick<ShopperProfileData, "name" | "email" | "phone">>>(
    "kq-profile-details",
    {},
  );
  const addresses = readJson<ShopperAddress[]>("kq-profile-addresses", []);
  return {
    name: typeof details.name === "string" ? details.name : "",
    email: typeof details.email === "string" ? details.email : "",
    phone: typeof details.phone === "string" ? details.phone : "",
    addresses: Array.isArray(addresses) ? addresses : [],
  };
}

function writeGuestProfile(profile: ShopperProfileData) {
  localStorage.setItem(
    "kq-profile-details",
    JSON.stringify({
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
    }),
  );
  localStorage.setItem("kq-profile-addresses", JSON.stringify(profile.addresses));
  window.dispatchEvent(new Event("kq-storage"));
}

function toWishlistItems(ids: string[]): WishlistItem[] {
  return ids.map((id) => ({ id, qty: 1 }));
}

const ShopperPreferencesContext =
  createContext<ShopperPreferencesContextValue | null>(null);

export function ShopperPreferencesProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = Boolean(isLoaded && isSignedIn && userId);
  const queryKey = ["shopper-preferences", userId];
  const preferencesQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getShopperPreferences({ signal }),
    enabled: signedIn,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const [guestWishlist, setGuestWishlist] = useState(readGuestWishlist);
  const [guestProfile, setGuestProfile] = useState(readGuestProfile);

  useEffect(() => {
    const refreshGuestData = () => {
      setGuestWishlist(readGuestWishlist());
      setGuestProfile(readGuestProfile());
    };
    window.addEventListener("storage", refreshGuestData);
    window.addEventListener("kq-storage", refreshGuestData);
    return () => {
      window.removeEventListener("storage", refreshGuestData);
      window.removeEventListener("kq-storage", refreshGuestData);
    };
  }, []);

  const preferences = signedIn ? preferencesQuery.data ?? emptyResponse : null;
  const wishlist = signedIn
    ? toWishlistItems(preferences?.wishlist ?? [])
    : guestWishlist;
  const profile = signedIn ? preferences?.profile ?? emptyProfile : guestProfile;

  const saveWishlist = useCallback(
    async (items: WishlistItem[]) => {
      if (signedIn && !preferencesQuery.data) {
        throw new Error("Your account preferences are not ready yet.");
      }
      const uniqueItems = items.filter(
        (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index,
      );
      if (!signedIn) {
        localStorage.setItem("kq-wish", JSON.stringify(uniqueItems));
        window.dispatchEvent(new Event("kq-storage"));
        setGuestWishlist(uniqueItems);
        return;
      }

      const result = await updateShopperWishlist({
        ids: uniqueItems.map((item) => item.id),
      });
      queryClient.setQueryData(queryKey, result);
    },
    [preferencesQuery.data, queryClient, queryKey, signedIn],
  );

  const toggleWishlist = useCallback(
    async (id: string) => {
      const current = signedIn
        ? toWishlistItems(
            queryClient.getQueryData<ShopperPreferencesResponse>(queryKey)?.wishlist ??
              preferencesQuery.data?.wishlist ??
              [],
          )
        : guestWishlist;
      const next = current.some((item) => item.id === id)
        ? current.filter((item) => item.id !== id)
        : [...current, { id, qty: 1 }];
      await saveWishlist(next);
    },
    [
      guestWishlist,
      preferencesQuery.data?.wishlist,
      queryClient,
      queryKey,
      saveWishlist,
      signedIn,
    ],
  );

  const saveProfile = useCallback(
    async (nextProfile: ShopperProfileData) => {
      if (signedIn && !preferencesQuery.data) {
        throw new Error("Your account preferences are not ready yet.");
      }
      if (!signedIn) {
        writeGuestProfile(nextProfile);
        setGuestProfile(nextProfile);
        return;
      }

      const result = await updateShopperProfile(nextProfile);
      queryClient.setQueryData(queryKey, result);
    },
    [preferencesQuery.data, queryClient, queryKey, signedIn],
  );

  const clearAll = useCallback(async () => {
    if (signedIn && !preferencesQuery.data) {
      throw new Error("Your account preferences are not ready yet.");
    }
    if (!signedIn) {
      localStorage.setItem("kq-wish", "[]");
      writeGuestProfile(emptyProfile);
      setGuestWishlist([]);
      setGuestProfile(emptyProfile);
      return;
    }

    await clearShopperPreferences();
    queryClient.setQueryData(queryKey, emptyResponse);
  }, [preferencesQuery.data, queryClient, queryKey, signedIn]);

  const retry = useCallback(async () => {
    if (signedIn) await preferencesQuery.refetch();
  }, [preferencesQuery, signedIn]);

  const value = useMemo<ShopperPreferencesContextValue>(
    () => ({
      signedIn,
      loading: !isLoaded || (signedIn && preferencesQuery.isLoading),
      error: signedIn && preferencesQuery.error instanceof Error
        ? preferencesQuery.error
        : null,
      wishlist,
      profile,
      saveWishlist,
      toggleWishlist,
      saveProfile,
      clearAll,
      retry,
    }),
    [
      clearAll,
      isLoaded,
      preferencesQuery.error,
      preferencesQuery.isLoading,
      profile,
      retry,
      saveProfile,
      saveWishlist,
      signedIn,
      toggleWishlist,
      wishlist,
    ],
  );

  return (
    <ShopperPreferencesContext.Provider value={value}>
      {children}
    </ShopperPreferencesContext.Provider>
  );
}

export function useShopperPreferences() {
  const value = useContext(ShopperPreferencesContext);
  if (!value) {
    throw new Error(
      "Shopper preferences must be used inside ShopperPreferencesProvider.",
    );
  }
  return value;
}

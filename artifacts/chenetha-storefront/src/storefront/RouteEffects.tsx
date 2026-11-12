import { useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";

type RouteSnapshot = {
  pathname: string;
  search: string;
  historyKey: string;
  entryId: string;
};

const SCROLL_ENTRY_STATE_KEY = "__chenethaScrollEntry";
let entrySequence = 0;

function collectionIdentity(pathname: string, search: string) {
  if (pathname.replace(/\/+$/, "").toLowerCase() !== "/collections") return "";

  const params = new URLSearchParams(search);
  for (const key of [
    "collection",
    "regionalHandloom",
    "handloom",
    "fabric",
    "weave",
    "premiumCategory",
  ]) {
    const values = params.getAll(key).map((value) => value.trim().toLowerCase()).filter(Boolean).sort();
    if (values.length) return `${key}:${values.join("|")}`;
  }
  return "";
}

function historyKey() {
  return `${window.location.pathname}${window.location.search}`;
}

function readEntryId(state: unknown = window.history.state): string | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[SCROLL_ENTRY_STATE_KEY];
  return typeof value === "string" ? value : null;
}

function createEntryId() {
  entrySequence += 1;
  return `${Date.now().toString(36)}-${entrySequence.toString(36)}`;
}

function withEntryId(state: unknown, entryId: string) {
  return {
    ...(state && typeof state === "object" ? state : {}),
    [SCROLL_ENTRY_STATE_KEY]: entryId,
  };
}

/**
 * Scrolls to the top for page/category navigation but restores saved listing
 * positions when a shopper returns with browser back/forward.
 */
export function ScrollRestoration() {
  const [pathname] = useLocation();
  const search = useSearch();
  const positionByHistoryEntry = useRef(new Map<string, number>());
  const navigationType = useRef<"push" | "replace" | "pop" | null>(null);
  const current = useRef<RouteSnapshot>({
    pathname,
    search,
    historyKey: historyKey(),
    entryId: readEntryId() ?? "",
  });

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const saveCurrentPosition = () => {
      if (current.current.entryId) {
        positionByHistoryEntry.current.set(current.current.entryId, window.scrollY);
      }
    };
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const wrappedPushState: History["pushState"] = function (this: History, ...args) {
      saveCurrentPosition();
      navigationType.current = "push";
      const nextArgs = [...args] as Parameters<History["pushState"]>;
      nextArgs[0] = withEntryId(nextArgs[0], createEntryId());
      return originalPushState.apply(this, nextArgs);
    };
    const wrappedReplaceState: History["replaceState"] = function (this: History, ...args) {
      saveCurrentPosition();
      navigationType.current = "replace";
      const entryId =
        readEntryId(args[0]) ??
        readEntryId() ??
        current.current.entryId ??
        createEntryId();
      const nextArgs = [...args] as Parameters<History["replaceState"]>;
      nextArgs[0] = withEntryId(nextArgs[0], entryId);
      return originalReplaceState.apply(this, nextArgs);
    };
    const onPopState = () => {
      navigationType.current = "pop";
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const entryId = readEntryId();
        window.scrollTo(0, entryId ? positionByHistoryEntry.current.get(entryId) ?? 0 : 0);
        navigationType.current = null;
      }));
    };
    const onScroll = () => saveCurrentPosition();

    window.history.pushState = wrappedPushState;
    window.history.replaceState = wrappedReplaceState;
    const currentEntryId = readEntryId() ?? createEntryId();
    current.current = { ...current.current, entryId: currentEntryId };
    positionByHistoryEntry.current.set(currentEntryId, window.scrollY);
    if (!readEntryId()) {
      window.history.replaceState(withEntryId(window.history.state, currentEntryId), "", window.location.href);
    }

    // Capture back/forward intent before the router's popstate subscriber runs.
    window.addEventListener("popstate", onPopState, true);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.history.scrollRestoration = previousRestoration;
      if (window.history.pushState === wrappedPushState) window.history.pushState = originalPushState;
      if (window.history.replaceState === wrappedReplaceState) window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", onPopState, true);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const next: RouteSnapshot = {
      pathname,
      search,
      historyKey: historyKey(),
      entryId: readEntryId() ?? "",
    };
    const previous = current.current;

    if (next.historyKey !== previous.historyKey || next.entryId !== previous.entryId) {
      if (previous.entryId) {
        positionByHistoryEntry.current.set(previous.entryId, window.scrollY);
      }

      const navigation = navigationType.current;
      const pageChanged = next.pathname !== previous.pathname;
      const categoryChanged =
        collectionIdentity(next.pathname, next.search) !==
        collectionIdentity(previous.pathname, previous.search);
      const hasSavedHistoryPosition =
        next.entryId !== previous.entryId &&
        positionByHistoryEntry.current.has(next.entryId);

      // Assign before scrolling so the resulting scroll event belongs to the
      // destination entry, not the listing we are leaving.
      current.current = next;

      if (navigation === "pop" || hasSavedHistoryPosition) {
        const savedPosition = positionByHistoryEntry.current.get(next.entryId) ?? 0;
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo(0, savedPosition)));
      } else if (pageChanged || categoryChanged) {
        window.scrollTo(0, 0);
        positionByHistoryEntry.current.set(next.entryId, 0);
      } else if (next.entryId) {
        positionByHistoryEntry.current.set(next.entryId, window.scrollY);
      }
    } else {
      current.current = next;
    }

    navigationType.current = null;
  }, [pathname, search]);

  return null;
}

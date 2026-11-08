import { useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Home } from "./storefront/Home";
import { Collections } from "./storefront/Collections";
import { Product } from "./storefront/Product";
import { Cart } from "./storefront/Cart";
import { Wishlist } from "./storefront/Wishlist";
import { Checkout } from "./storefront/Checkout";
import { Confirmation } from "./storefront/Confirmation";
import { OurStory } from "./storefront/OurStory";
import { Contact } from "./storefront/Contact";
import { CustomerCare } from "./storefront/CustomerCare";
import { SareeCare } from "./storefront/SareeCare";
import { Account } from "./storefront/Account";
import { Profile } from "./storefront/Profile";
import { Orders } from "./storefront/Orders";
import { OrderDetail } from "./storefront/OrderDetail";
import { Videos } from "./storefront/Videos";
import { AdminDashboard, AdminDiscounts, AdminProducts, AdminSignInPrompt } from "./admin/Admin";
import { AdminContent } from "./admin/ContentAdmin";
import { ShopperPreferencesProvider } from "./storefront/ShopperPreferences";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const externalAuth = import.meta.env.VITE_CLERK_AUTH_MODE === "external";
const clerkPublishableKey = externalAuth ? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY : publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = externalAuth ? undefined : import.meta.env.VITE_CLERK_PROXY_URL;
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/images/koushikii/wordmark-red.png`,
  },
  variables: {
    colorPrimary: "#B22222",
    colorForeground: "#332a25",
    colorMutedForeground: "#75675e",
    colorDanger: "#9e2d25",
    colorBackground: "#fbf7ef",
    colorInput: "#fffdf9",
    colorInputForeground: "#332a25",
    colorNeutral: "#d8cbbb",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "6px",
  },
  elements: {
    rootBox: { width: "100%", maxWidth: "440px", minWidth: "0" },
    cardBox: { width: "100%", maxWidth: "440px", minWidth: "0", background: "#fbf7ef", borderRadius: "12px", overflow: "hidden" },
    card: { width: "100%", maxWidth: "100%", boxSizing: "border-box" as const, boxShadow: "none", border: "0", background: "transparent", borderRadius: "0" },
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#332a25] font-semibold",
    headerSubtitle: "text-[#75675e]",
    socialButtonsBlockButtonText: "text-[#332a25] font-medium",
    formFieldLabel: "text-[#4b3e37] font-medium",
    footerActionLink: "text-[#9d1d22] font-semibold",
    footerActionText: "text-[#75675e]",
    dividerText: "text-[#75675e]",
    identityPreviewEditButton: "text-[#9d1d22]",
    formFieldSuccessText: "text-[#3d684b]",
    alertText: "text-[#332a25]",
    logoBox: "rounded-lg",
    logoImage: "object-contain",
    socialButtonsBlockButton: "border-[#d8cbbb] bg-[#fffdf9] hover:bg-[#f4eee4]",
    formButtonPrimary: "bg-[#B22222] hover:bg-[#8f1b1b] text-white",
    formFieldInput: "border-[#d8cbbb] bg-[#fffdf9] text-[#332a25]",
    footerAction: "text-[#75675e]",
    dividerLine: "bg-[#d8cbbb]",
    alert: "border-[#d8cbbb] bg-[#fff8f1]",
    otpCodeFieldInput: "border-[#d8cbbb] bg-[#fffdf9] text-[#332a25]",
    formFieldRow: "text-[#332a25]",
    main: "text-[#332a25]",
  },
};

const pageTitles: Record<string,string> = {
  "/": "Home", "/Home": "Home", "/Collections": "Collections", "/Product": "Textile details",
  "/Cart": "Your bag", "/Wishlist": "Wishlist", "/Checkout": "Delivery details",
  "/Confirmation": "Order confirmation", "/OurStory": "Our story", "/Contact": "Contact",
  "/CustomerCare": "Customer care", "/SareeCare": "Saree care", "/Account": "Saved preferences",
  "/Profile": "Your details", "/Orders": "Your orders", "/Videos": "Videos",
  "/admin": "Merchant workroom", "/admin/products": "Manage products",
  "/admin/discounts": "Manage discounts", "/admin/content": "Storefront content", "/sign-in": "Account sign in",
  "/sign-up": "Create an account",
};

function Metadata() {
  const [location] = useLocation();
  useEffect(() => {
    const title = pageTitles[location] || "Chenetha by Koushikii";
    document.title = `${title} · Chenetha by Koushikii`;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = `Explore handloom textiles, care notes and regional weaves from Chenetha by Koushikii. ${title}.`;
  }, [location]);
  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ProtectedAdmin({ page }: { page: ReactNode }) {
  return <Show when="signed-in" fallback={<AdminSignInPrompt/>}>{page}</Show>;
}

function SignInPage() {
  const redirectPath = authRedirectPath();
  return <div className="clerk-screen"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={authWidgetUrl("/sign-up", redirectPath)} forceRedirectUrl={`${basePath}${redirectPath}`}/></div>;
}

function SignUpPage() {
  const redirectPath = authRedirectPath();
  return <div className="clerk-screen"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={authWidgetUrl("/sign-in", redirectPath)} forceRedirectUrl={`${basePath}${redirectPath}`}/></div>;
}

function authRedirectPath(): string {
  const destination = new URLSearchParams(window.location.search).get("redirect_url");
  if (!destination) return "/Account";

  let internalPath: string;
  if (destination.startsWith("/") && !destination.startsWith("//")) {
    internalPath = destination;
  } else {
    try {
      const parsedDestination = new URL(destination);
      if (parsedDestination.origin !== window.location.origin) return "/Account";
      internalPath = `${parsedDestination.pathname}${parsedDestination.search}${parsedDestination.hash}`;
    } catch {
      return "/Account";
    }
  }

  if (basePath && (internalPath === basePath || internalPath.startsWith(`${basePath}/`))) {
    internalPath = internalPath.slice(basePath.length) || "/";
  }
  return internalPath.startsWith("/") && !internalPath.startsWith("//")
    ? internalPath
    : "/Account";
}

function authWidgetUrl(route: "/sign-in" | "/sign-up", redirectPath: string): string {
  return `${basePath}${route}?redirect_url=${encodeURIComponent(redirectPath)}`;
}

function Router() {
  return <>
    <Metadata/>
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage}/>
        <Route path="/sign-up/*?" component={SignUpPage}/>
        <Route path="/admin"><ProtectedAdmin page={<AdminDashboard/>}/></Route>
        <Route path="/admin/products"><ProtectedAdmin page={<AdminProducts/>}/></Route>
        <Route path="/admin/discounts"><ProtectedAdmin page={<AdminDiscounts/>}/></Route>
        <Route path="/admin/content"><ProtectedAdmin page={<AdminContent/>}/></Route>
          <Route path="/" component={Home}/>
        <Route path="/Home" component={Home}/>
        <Route path="/Collections" component={Collections}/>
        <Route path="/Product" component={Product}/>
        <Route path="/Cart" component={Cart}/>
        <Route path="/Wishlist" component={Wishlist}/>
        <Route path="/Checkout" component={Checkout}/>
        <Route path="/Confirmation" component={Confirmation}/>
        <Route path="/OurStory" component={OurStory}/>
        <Route path="/Contact" component={Contact}/>
        <Route path="/CustomerCare" component={CustomerCare}/>
        <Route path="/SareeCare" component={SareeCare}/>
        <Route path="/Account" component={Account}/>
        <Route path="/Profile" component={Profile}/>
        <Route path="/Orders/:orderRef" component={OrderDetail}/>
        <Route path="/Orders" component={Orders}/>
        <Route path="/Videos" component={Videos}/>
        <Route component={NotFound}/>
      </Switch>
    </RoutedErrorBoundary>
  </>;
}

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        previousUserId.current !== undefined &&
        previousUserId.current !== userId
      ) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) =>
    basePath && path.startsWith(basePath)
      ? path.slice(basePath.length) || "/"
      : path;

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to your Chenetha account" } },
        signUp: { start: { title: "Create your Chenetha account", subtitle: "Save your preferences or request store access" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkCacheInvalidator />
      <ShopperPreferencesProvider>
        <Router />
      </ShopperPreferencesProvider>
    </ClerkProvider>
  );
}

function App() {
  return <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter base={basePath}><ClerkApp/></WouterRouter>
      <Toaster/>
    </TooltipProvider>
  </QueryClientProvider>;
}

export default App;

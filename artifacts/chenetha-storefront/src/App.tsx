import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { ClerkProvider, Show, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { ShopperPreferencesProvider } from "./storefront/ShopperPreferences";
import { ScrollRestoration } from "./storefront/RouteEffects";

const Home = lazy(() => import("./storefront/Home").then((module) => ({ default: module.Home })));
const Collections = lazy(() => import("./storefront/Collections").then((module) => ({ default: module.Collections })));
const Product = lazy(() => import("./storefront/Product").then((module) => ({ default: module.Product })));
const Cart = lazy(() => import("./storefront/Cart").then((module) => ({ default: module.Cart })));
const Wishlist = lazy(() => import("./storefront/Wishlist").then((module) => ({ default: module.Wishlist })));
const Checkout = lazy(() => import("./storefront/Checkout").then((module) => ({ default: module.Checkout })));
const Confirmation = lazy(() => import("./storefront/Confirmation").then((module) => ({ default: module.Confirmation })));
const OurStory = lazy(() => import("./storefront/OurStory").then((module) => ({ default: module.OurStory })));
const Contact = lazy(() => import("./storefront/Contact").then((module) => ({ default: module.Contact })));
const CustomerCare = lazy(() => import("./storefront/CustomerCare").then((module) => ({ default: module.CustomerCare })));
const SareeCare = lazy(() => import("./storefront/SareeCare").then((module) => ({ default: module.SareeCare })));
const Account = lazy(() => import("./storefront/Account").then((module) => ({ default: module.Account })));
const Profile = lazy(() => import("./storefront/Profile").then((module) => ({ default: module.Profile })));
const Orders = lazy(() => import("./storefront/Orders").then((module) => ({ default: module.Orders })));
const OrderDetail = lazy(() => import("./storefront/OrderDetail").then((module) => ({ default: module.OrderDetail })));
const Videos = lazy(() => import("./storefront/Videos").then((module) => ({ default: module.Videos })));
const AdminDashboard = lazy(() => import("./admin/Admin").then((module) => ({ default: module.AdminDashboard })));
const AdminDiscounts = lazy(() => import("./admin/Admin").then((module) => ({ default: module.AdminDiscounts })));
const AdminProducts = lazy(() => import("./admin/Admin").then((module) => ({ default: module.AdminProducts })));
const AdminSignInPrompt = lazy(() => import("./admin/Admin").then((module) => ({ default: module.AdminSignInPrompt })));
const AdminSettings = lazy(() => import("./admin/StorefrontSettings").then((module) => ({ default: module.AdminSettings })));
const AdminContent = lazy(() => import("./admin/ContentAdmin").then((module) => ({ default: module.AdminContent })));
const SignInPage = lazy(() => import("./AuthPages").then((module) => ({ default: module.SignInPage })));
const SignUpPage = lazy(() => import("./AuthPages").then((module) => ({ default: module.SignUpPage })));

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
  "/admin/settings": "Store settings",
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

function ProtectedShopperRoute({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const browserPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const intendedPath = basePath && (browserPath === basePath || browserPath.startsWith(`${basePath}/`))
    ? browserPath.slice(basePath.length) || "/"
    : browserPath;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(intendedPath)}`;

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation(signInHref);
  }, [isLoaded, isSignedIn, setLocation, signInHref]);

  if (!isLoaded || !isSignedIn) {
    return <main className="clerk-screen" role="status">Checking your account…</main>;
  }
  return <>{children}</>;
}

function Router() {
  return <>
    <ScrollRestoration/>
    <Metadata/>
    <RoutedErrorBoundary>
      <Suspense fallback={<main className="clerk-screen" role="status">Loading page…</main>}>
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage}/>
        <Route path="/sign-up/*?" component={SignUpPage}/>
        <Route path="/admin"><ProtectedAdmin page={<AdminDashboard/>}/></Route>
        <Route path="/admin/products"><ProtectedAdmin page={<AdminProducts/>}/></Route>
        <Route path="/admin/discounts"><ProtectedAdmin page={<AdminDiscounts/>}/></Route>
        <Route path="/admin/content"><ProtectedAdmin page={<AdminContent/>}/></Route>
        <Route path="/admin/settings"><ProtectedAdmin page={<AdminSettings/>}/></Route>
          <Route path="/" component={Home}/>
        <Route path="/Home" component={Home}/>
        <Route path="/Collections" component={Collections}/>
        <Route path="/Product/:handle" component={Product}/>
        <Route path="/Product" component={Product}/>
        <Route path="/Cart" component={Cart}/>
        <Route path="/Wishlist" component={Wishlist}/>
        <Route path="/Checkout"><ProtectedShopperRoute><Checkout/></ProtectedShopperRoute></Route>
        <Route path="/Confirmation"><ProtectedShopperRoute><Confirmation/></ProtectedShopperRoute></Route>
        <Route path="/OurStory" component={OurStory}/>
        <Route path="/Contact" component={Contact}/>
        <Route path="/CustomerCare" component={CustomerCare}/>
        <Route path="/SareeCare" component={SareeCare}/>
        <Route path="/Account" component={Account}/>
        <Route path="/Profile"><ProtectedShopperRoute><Profile/></ProtectedShopperRoute></Route>
        <Route path="/Orders/:orderRef" component={OrderDetail}/>
        <Route path="/Orders" component={Orders}/>
        <Route path="/Videos" component={Videos}/>
        <Route component={NotFound}/>
      </Switch>
      </Suspense>
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

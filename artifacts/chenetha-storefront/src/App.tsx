import { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
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
import { Videos } from "./storefront/Videos";

const queryClient = new QueryClient();
const pageTitles: Record<string,string> = {
  "/": "Home", "/Home": "Home", "/Collections": "Collections", "/Product": "Textile details",
  "/Cart": "Your bag", "/Wishlist": "Wishlist", "/Checkout": "Review enquiry",
  "/Confirmation": "WhatsApp handoff", "/OurStory": "Our story", "/Contact": "Contact",
  "/CustomerCare": "Customer care", "/SareeCare": "Saree care", "/Account": "Saved preferences",
  "/Profile": "Your details", "/Orders": "Order information", "/Videos": "Videos"
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

function Router() {
  return <>
    <Metadata/>
    <RoutedErrorBoundary>
      <Switch>
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
        <Route path="/Orders" component={Orders}/>
        <Route path="/Videos" component={Videos}/>
        <Route component={NotFound}/>
      </Switch>
    </RoutedErrorBoundary>
  </>;
}

function App() {
  return <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter><Router/></WouterRouter>
      <Toaster/>
    </TooltipProvider>
  </QueryClientProvider>;
}

export default App;

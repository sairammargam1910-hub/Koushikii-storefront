import { SignIn, SignUp } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function SignInPage() {
  const redirectPath = authRedirectPath();
  return <div className="clerk-screen"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={authWidgetUrl("/sign-up", redirectPath)} forceRedirectUrl={`${basePath}${redirectPath}`}/></div>;
}

export function SignUpPage() {
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

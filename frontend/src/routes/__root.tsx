import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { setSession, useSession } from "@/lib/session";
import { Ticket, ArrowUpRight } from "lucide-react";
import { usingMock } from "@/lib/api";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Kezek — Virtual Queue" },
      { name: "referrer", content: "no-referrer" },
      { name: "description", content: "Join queues remotely and track your place in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}

function Nav() {
  const session = useSession();
  const queryClient = useQueryClient();
  const linkCls = "text-sm text-muted-foreground hover:text-foreground";
  const active = { className: "text-sm font-semibold text-foreground" };
  return (
    <header className="border-b bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center gap-x-7 gap-y-3 px-5 py-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"
          aria-label="Kezek home"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
            <Ticket size={21} />
          </span>
          kezek<span className="text-primary">.</span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-1 items-center gap-6">
          <Link to="/" className={linkCls} activeProps={active} activeOptions={{ exact: true }}>
            Explore
          </Link>
          <Link to="/tickets" className={linkCls} activeProps={active}>
            My Tickets
          </Link>
          {session && (
            <Link to="/staff" className={linkCls} activeProps={active}>
              Staff
            </Link>
          )}
          {session?.user.role === "admin" && (
            <Link to="/admin" className={linkCls} activeProps={active}>
              Admin
            </Link>
          )}
        </nav>
        {usingMock && <span className="status-pill">Demo mode</span>}
        {session ? (
          <button
            className={linkCls}
            onClick={() => {
              setSession(null);
              queryClient.clear();
            }}
          >
            Sign out
          </button>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground sm:text-sm"
          >
            Staff sign in <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
    </header>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Nav />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto min-h-[calc(100vh-230px)] max-w-6xl px-5 py-10 sm:py-14"
      >
        <Outlet />
      </main>
      <footer className="mt-8 border-t bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-8 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            kezek.{" "}
            <span className="ml-3 font-normal text-muted-foreground">
              Your time, back in your hands.
            </span>
          </span>
          <span>Virtual queues for Kazakhstan · No customer account needed</span>
        </div>
      </footer>
    </QueryClientProvider>
  );
}

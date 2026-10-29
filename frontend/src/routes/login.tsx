import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, usingMock } from "@/lib/api";
import { restoreSession, setSession, useSessionState } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const session = await restoreSession(api.getCurrentIdentity, api.getCsrfToken);
    if (session) {
      throw redirect({ to: session.user.role === "admin" ? "/admin" : "/staff" });
    }
  },
  head: () => ({
    meta: [
      { title: "Staff sign in — Kezek" },
      { name: "description", content: "Sign in to manage queues and counters." },
      { property: "og:title", content: "Staff sign in — Kezek" },
      { property: "og:description", content: "Sign in to manage queues and counters." },
    ],
  }),
  component: Login,
});

function Login() {
  const hydrated = useHydrated();
  const sessionState = useSessionState();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = useMutation({
    meta: { authFlow: true },
    mutationFn: async () => {
      const result = await api.login(username, password);
      if (!usingMock) await api.getCsrfToken();
      return result;
    },
    onSuccess: (s) => {
      queryClient.clear();
      setSession({ ...s, token: usingMock ? s.token : null });
      setP("");
      navigate({ to: s.user.role === "admin" ? "/admin" : "/staff" });
    },
  });
  useEffect(() => {
    if (sessionState.ready && sessionState.session) {
      navigate({ to: sessionState.session.user.role === "admin" ? "/admin" : "/staff" });
    }
  }, [navigate, sessionState.ready, sessionState.session]);
  return (
    <div className="mx-auto max-w-sm rounded-2xl border bg-card p-8">
      <h1 className="text-2xl font-bold">Staff sign in</h1>
      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <Input
          disabled={!hydrated || !sessionState.ready}
          aria-label="Username"
          autoComplete="username"
          required
          placeholder="Username"
          value={username}
          onChange={(e) => setU(e.target.value)}
        />
        <Input
          type="password"
          disabled={!hydrated || !sessionState.ready}
          aria-label="Password"
          autoComplete="current-password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setP(e.target.value)}
        />
        {login.error && (
          <p role="alert" className="text-sm text-destructive">
            {login.error.message}
          </p>
        )}
        <Button className="w-full" disabled={!hydrated || !sessionState.ready || login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {(import.meta.env.DEV || usingMock) && (
        <p className="mt-4 text-xs text-muted-foreground">
          Development demo accounts: admin / admin123 (all organizations) · aigerim / staff123 ·
          demo-staff-university / staff123 · demo-staff-clinic / staff123 · demo-staff-government /
          staff123 · demo-staff-center / staff123
        </p>
      )}
    </div>
  );
}

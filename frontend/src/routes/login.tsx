import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, usingMock } from "@/lib/api";
import { setSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
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
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: (s) => {
      queryClient.clear();
      setSession(s);
      setP("");
      navigate({ to: s.user.role === "admin" ? "/admin" : "/staff" });
    },
  });
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
          disabled={!hydrated}
          aria-label="Username"
          autoComplete="username"
          required
          placeholder="Username"
          value={username}
          onChange={(e) => setU(e.target.value)}
        />
        <Input
          type="password"
          disabled={!hydrated}
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
        <Button className="w-full" disabled={!hydrated || login.isPending}>
          Sign in
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

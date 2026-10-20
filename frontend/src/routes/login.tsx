import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, usingMock } from "@/lib/api";
import { setSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
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
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const navigate = useNavigate();
  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: (s) => {
      setSession(s);
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
        <Input placeholder="Username" value={username} onChange={(e) => setU(e.target.value)} />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setP(e.target.value)}
        />
        {login.error && <p className="text-sm text-destructive">{login.error.message}</p>}
        <Button className="w-full" disabled={login.isPending}>
          Sign in
        </Button>
      </form>
      {usingMock && (
        <p className="mt-4 text-xs text-muted-foreground">
          Demo accounts: admin / admin123 · aigerim / staff123
        </p>
      )}
    </div>
  );
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const user = {
  id: "staff-1",
  name: "Aida",
  username: "aida",
  role: "staff" as const,
};

describe("cookie-backed browser sessions", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("restores identity and CSRF after reload without persisting a bearer token", async () => {
    const session = await import("@/lib/session");
    localStorage.setItem("kezek-session", JSON.stringify({ token: "old-bearer", user }));
    const getIdentity = vi.fn().mockResolvedValue(user);
    const getCsrf = vi.fn().mockResolvedValue({ csrfToken: "session-proof" });

    const [first, second] = await Promise.all([
      session.restoreSession(getIdentity, getCsrf),
      session.restoreSession(getIdentity, getCsrf),
    ]);

    expect(first).toEqual(second);
    expect(first).toEqual({ token: null, user });
    expect(session.getToken()).toBeNull();
    expect(session.getSessionState().ready).toBe(true);
    expect(localStorage.getItem("kezek-session")).toBeNull();
    expect(getIdentity).toHaveBeenCalledOnce();
    expect(getCsrf).toHaveBeenCalledOnce();
  });

  it("treats a rejected current identity as an expired session", async () => {
    const [{ ApiError }, session] = await Promise.all([
      import("@/lib/api/types"),
      import("@/lib/session"),
    ]);
    const getCsrf = vi.fn();

    await expect(
      session.restoreSession(async () => {
        throw new ApiError(401, "Not authenticated");
      }, getCsrf),
    ).resolves.toBeNull();

    expect(session.getSession()).toBeNull();
    expect(session.getSessionState().ready).toBe(true);
    expect(getCsrf).not.toHaveBeenCalled();
  });

  it("clears protected cached data and identity after an authorization denial", async () => {
    const [{ ApiError }, session, { createAppQueryClient }] = await Promise.all([
      import("@/lib/api/types"),
      import("@/lib/session"),
      import("@/router"),
    ]);
    const client = createAppQueryClient();
    session.setSession({ token: null, user });
    client.setQueryData(["admin", "services"], [{ id: "private-service" }]);

    const protectedQuery = client.getQueryCache().build(client, {
      queryKey: ["expired-auth"],
      queryFn: async () => [],
    });
    client
      .getQueryCache()
      .config.onError?.(new ApiError(401, "Session expired"), protectedQuery as never);

    expect(session.getSession()).toBeNull();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does not clear an existing session for a failed login attempt", async () => {
    const [{ ApiError }, session, { createAppQueryClient }] = await Promise.all([
      import("@/lib/api/types"),
      import("@/lib/session"),
      import("@/router"),
    ]);
    const client = createAppQueryClient();
    session.setSession({ token: null, user });
    const login = client.getMutationCache().build(client, {
      mutationFn: async () => {
        throw new ApiError(401, "Invalid username or password");
      },
      meta: { authFlow: true },
    });

    await expect(login.execute(undefined)).rejects.toMatchObject({ status: 401 });

    expect(session.getSession()).toEqual({ token: null, user });
  });
});

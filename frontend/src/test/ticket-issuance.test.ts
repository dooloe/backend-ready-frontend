import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { clearPendingJoin, pendingJoin, retainJoinForRetry } from "@/lib/ticket-issuance";

const STORAGE_KEY = "kezek-pending-joins-v1";
beforeEach(() => sessionStorage.clear());

describe("anonymous ticket retry credentials", () => {
  it("generates separate canonical proofs and reuses them for an uncertain queue request", () => {
    let nextByte = 1;
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(nextByte++);
      return array;
    });

    const first = pendingJoin("queue-a");
    expect(first.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.accessToken).not.toBe(first.idempotencyKey);
    expect(pendingJoin("queue-a")).toEqual(first);
    expect(pendingJoin("queue-b")).not.toEqual(first);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}")).toHaveProperty("queue-a");
  });

  it("clears a confirmed or explicitly rejected attempt", () => {
    const proofs = pendingJoin("queue-a");
    expect(pendingJoin("queue-a")).toEqual(proofs);
    clearPendingJoin("queue-a");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps uncertain and busy requests retryable but clears definitive responses", () => {
    expect(retainJoinForRetry(new TypeError("Network disconnected"))).toBe(true);
    expect(retainJoinForRetry(new ApiError(503, "Database busy"))).toBe(true);
    expect(retainJoinForRetry(new ApiError(409, "Queue closed"))).toBe(false);
  });
});

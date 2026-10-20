import { describe, expect, it } from "vitest";

import { ticketRefetchInterval } from "@/lib/ticket-polling";

describe("ticket polling", () => {
  it.each(["completed", "cancelled", "no_show"])("stops polling for %s tickets", (status) => {
    expect(ticketRefetchInterval(status)).toBe(false);
  });

  it.each([undefined, "waiting", "called", "serving"])(
    "refreshes active tickets (%s) every three seconds",
    (status) => {
      expect(ticketRefetchInterval(status)).toBe(3000);
    },
  );
});

import { beforeEach, expect, it } from "vitest";
import { savedTicketIds, saveTicket } from "@/lib/saved-tickets";
beforeEach(() => localStorage.clear());
it("retains only ticket links received on this browser and deduplicates", () => {
  expect(savedTicketIds()).toEqual([]);
  saveTicket("private_capability_123");
  saveTicket("private_capability_456");
  saveTicket("private_capability_123");
  expect(savedTicketIds()).toEqual(["private_capability_123", "private_capability_456"]);
});
it("ignores malformed storage and unsafe path values", () => {
  localStorage.setItem(
    "kezek-ticket-links-v1",
    JSON.stringify(["../other", 42, "valid_capability"]),
  );
  expect(savedTicketIds()).toEqual(["valid_capability"]);
  localStorage.setItem("kezek-ticket-links-v1", "broken-json");
  expect(savedTicketIds()).toEqual([]);
});

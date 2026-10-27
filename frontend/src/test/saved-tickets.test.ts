import { beforeEach, expect, it } from "vitest";
import { savedTicketLinks, savedTicketTokens, saveTicketToken } from "@/lib/saved-tickets";
beforeEach(() => localStorage.clear());
const tokenA = "A".repeat(43);
const tokenB = "B".repeat(43);
it("retains only private token links received on this browser and deduplicates", () => {
  expect(savedTicketTokens()).toEqual([]);
  saveTicketToken(tokenA);
  saveTicketToken(tokenB);
  saveTicketToken(tokenA);
  expect(savedTicketTokens()).toEqual([tokenA, tokenB]);
});
it("ignores malformed storage and unsafe path values", () => {
  localStorage.setItem(
    "kezek-private-ticket-links-v2",
    JSON.stringify(["../other", 42, "valid_capability", "C".repeat(43)]),
  );
  expect(savedTicketTokens()).toEqual(["C".repeat(43)]);
  localStorage.setItem("kezek-private-ticket-links-v2", "broken-json");
  expect(savedTicketTokens()).toEqual([]);
});

it("drops unsafe legacy ticket IDs and retains only private links", () => {
  localStorage.setItem("kezek-ticket-links-v1", JSON.stringify(["old_ticket_capability"]));
  expect(savedTicketLinks()).toEqual([]);
  expect(localStorage.getItem("kezek-ticket-links-v1")).toBeNull();
});

import { createFileRoute } from "@tanstack/react-router";
import { Index } from "@/components/explore-directory";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kezek — Get your ticket online" },
      {
        name: "description",
        content:
          "Discover organizations across Kazakhstan, join a virtual queue, and track your digital ticket. No account needed.",
      },
    ],
  }),
  component: Index,
});

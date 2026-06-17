"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchHero() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();

        if (query.trim()) {
          params.set("q", query.trim());
        }

        router.push(`/fighters${params.toString() ? `?${params.toString()}` : ""}`);
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search fighters by name"
        className="h-12 border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
      />
      <Button
        type="submit"
        className="h-12 bg-red-500 text-white hover:bg-red-400 sm:px-8"
      >
        Explore roster
      </Button>
    </form>
  );
}
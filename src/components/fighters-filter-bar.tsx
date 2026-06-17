"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FightersFilterBarProps = {
  weightClasses: string[];
  stances: string[];
  nationalities: string[];
  current: {
    q: string;
    weightClass: string;
    stance: string;
    nationality: string;
    sort: string;
  };
};

export function FightersFilterBar({
  weightClasses,
  stances,
  nationalities,
  current,
}: FightersFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());

    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    next.delete("page");
    router.push(`${pathname ?? "/fighters"}${next.toString() ? `?${next.toString()}` : ""}`);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_repeat(4,minmax(0,1fr))]">
      <Input
        defaultValue={current.q}
        placeholder="Search by fighter name"
        className="h-11 border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            updateParam("q", event.currentTarget.value);
          }
        }}
      />
      <Select
        value={current.weightClass || "all"}
        onValueChange={(value) => updateParam("weightClass", value ?? "all")}
      >
        <SelectTrigger className="h-11 border-white/10 bg-white/5 text-white">
          <SelectValue placeholder="Weight class" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All weight classes</SelectItem>
          {weightClasses.map((weightClass) => (
            <SelectItem key={weightClass} value={weightClass ?? "unknown-weight-class"}>
              {weightClass}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={current.stance || "all"}
        onValueChange={(value) => updateParam("stance", value ?? "all")}
      >
        <SelectTrigger className="h-11 border-white/10 bg-white/5 text-white">
          <SelectValue placeholder="Stance" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stances</SelectItem>
          {stances.map((stance) => (
            <SelectItem key={stance} value={stance ?? "unknown-stance"}>
              {stance}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={current.nationality || "all"}
        onValueChange={(value) => updateParam("nationality", value ?? "all")}
      >
        <SelectTrigger className="h-11 border-white/10 bg-white/5 text-white">
          <SelectValue placeholder="Nationality" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All nationalities</SelectItem>
          {nationalities.map((nationality) => (
            <SelectItem key={nationality} value={nationality ?? "unknown-nationality"}>
              {nationality}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={current.sort}
        onValueChange={(value) => updateParam("sort", value ?? "name")}
      >
        <SelectTrigger className="h-11 border-white/10 bg-white/5 text-white">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Sort: Name</SelectItem>
          <SelectItem value="wins">Sort: Wins</SelectItem>
          <SelectItem value="losses">Sort: Losses</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
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
import { formatWeightClass } from "@/lib/format";

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

  const weightClassItems = {
    all: "Todas las categorías de peso",
    ...Object.fromEntries(
      weightClasses.map((weightClass) => [weightClass, formatWeightClass(weightClass)]),
    ),
  };
  const nationalityItems = {
    all: "Todas las nacionalidades",
    ...Object.fromEntries(nationalities.map((nationality) => [nationality, nationality])),
  };
  const stanceItems = {
    all: "Todas las guardias",
    ...Object.fromEntries(stances.map((stance) => [stance, stance])),
  };
  const sortItems = {
    name: "Ordenar: Nombre",
    wins: "Ordenar: Victorias",
    losses: "Ordenar: Derrotas",
  };

  return (
    <div className="space-y-5">
      <Input
        defaultValue={current.q}
        placeholder="Buscar por nombre del luchador"
        className="h-11 w-full border-border bg-card text-foreground"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            updateParam("q", event.currentTarget.value);
          }
        }}
      />
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 block">
          Categoría de peso
        </label>
        <Select
          items={weightClassItems}
          value={current.weightClass || "all"}
          onValueChange={(value) => updateParam("weightClass", value ?? "all")}
        >
          <SelectTrigger className="h-11 w-full border-border bg-card text-foreground">
            <SelectValue placeholder="Categoría de peso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías de peso</SelectItem>
            {weightClasses.map((weightClass) => (
              <SelectItem key={weightClass} value={weightClass ?? "unknown-weight-class"}>
                {formatWeightClass(weightClass)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 block">
          Nacionalidad
        </label>
        <Select
          items={nationalityItems}
          value={current.nationality || "all"}
          onValueChange={(value) => updateParam("nationality", value ?? "all")}
        >
          <SelectTrigger className="h-11 w-full border-border bg-card text-foreground">
            <SelectValue placeholder="Nacionalidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las nacionalidades</SelectItem>
            {nationalities.map((nationality) => (
              <SelectItem key={nationality} value={nationality ?? "unknown-nationality"}>
                {nationality}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 block">
          Guardia
        </label>
        <Select
          items={stanceItems}
          value={current.stance || "all"}
          onValueChange={(value) => updateParam("stance", value ?? "all")}
        >
          <SelectTrigger className="h-11 w-full border-border bg-card text-foreground">
            <SelectValue placeholder="Guardia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las guardias</SelectItem>
            {stances.map((stance) => (
              <SelectItem key={stance} value={stance ?? "unknown-stance"}>
                {stance}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2 block">
          Ordenar por
        </label>
        <Select
          items={sortItems}
          value={current.sort}
          onValueChange={(value) => updateParam("sort", value ?? "name")}
        >
          <SelectTrigger className="h-11 w-full border-border bg-card text-foreground">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Ordenar: Nombre</SelectItem>
            <SelectItem value="wins">Ordenar: Victorias</SelectItem>
            <SelectItem value="losses">Ordenar: Derrotas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      </div>
    </div>
  );
}
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EventosYearFilterProps = {
  years: number[];
  current: number | null;
};

// FE7: filtro de año de la vista "Pasados" de /eventos. Mismo patrón que
// FightersFilterBar: select client que reescribe los searchParams con
// router.push; cambiar de año elimina ?page (resetea la paginación).
export function EventosYearFilter({ years, current }: EventosYearFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateYear(value: string) {
    const next = new URLSearchParams(searchParams.toString());

    if (!value || value === "all") {
      next.delete("anio");
    } else {
      next.set("anio", value);
    }

    next.delete("page");
    router.push(
      `${pathname ?? "/eventos"}${next.toString() ? `?${next.toString()}` : ""}`,
    );
  }

  const items = {
    all: "Todos los años",
    ...Object.fromEntries(years.map((year) => [String(year), String(year)])),
  };

  return (
    <div className="flex items-center gap-2.5">
      <label
        htmlFor="filter-anio"
        className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
      >
        Año
      </label>
      <Select
        items={items}
        value={current != null ? String(current) : "all"}
        onValueChange={(value) => updateYear(value ?? "all")}
      >
        <SelectTrigger
          id="filter-anio"
          className="h-9 w-40 border-border bg-card text-foreground"
        >
          <SelectValue placeholder="Año" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los años</SelectItem>
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

import { nationalityToCountryCode } from "@/lib/flags";
import { cn } from "@/lib/utils";

type CountryFlagProps = {
  nationality: string | null | undefined;
  className?: string;
};

// Small SVG flag (flagcdn) for a nationality, or nothing if we can't resolve a country.
// Plain <img> (not next/image) so we avoid remotePatterns config; SVG stays crisp at any size.
export function CountryFlag({ nationality, className }: CountryFlagProps) {
  const code = nationalityToCountryCode(nationality);
  if (!code) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${code}.svg`}
      alt=""
      width={20}
      height={15}
      loading="lazy"
      className={cn(
        "inline-block h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-border",
        className,
      )}
    />
  );
}

import Image from "next/image";

import { cn } from "@/lib/utils";

// Guante hexagonal de la marca como separador "VS" del cara a cara: sustituye
// a los antiguos octágonos con el texto "VS" (dueño, 11-jul). El asset
// (glove-hex.webp, con alfa) se genera desde brand/mark-hex.png.
export function VsGlove({
  className,
  size = 48,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <Image
      src="/brand/glove-hex.webp"
      alt="VS"
      width={size}
      height={size}
      className={cn("drop-shadow-md", className)}
    />
  );
}

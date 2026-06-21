import type { Metadata } from "next";

import { MaestroChat } from "@/components/maestro-chat";

export const metadata: Metadata = {
  title: "Maestro de UFC",
  description:
    "Pregúntale al Maestro: una IA experta en UFC con acceso en vivo a récords, estadísticas, rankings, eventos y noticias del proyecto.",
};

export default function MaestroPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-13rem)] w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <MaestroChat />
    </div>
  );
}

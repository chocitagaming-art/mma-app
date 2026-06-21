"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, SendHorizonal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
};

const TOOL_LABELS: Record<string, string> = {
  buscar_luchador: "Buscó al luchador",
  ficha_y_stats: "Consultó ficha y stats",
  historial_peleas: "Revisó el historial",
  evento: "Buscó el evento",
  ranking: "Consultó el ranking",
  comparar: "Comparó luchadores",
  noticias: "Buscó noticias",
};

const EXAMPLES = [
  "¿Cómo es el récord de Islam Makhachev?",
  "Compara a Jon Jones y Tom Aspinall",
  "¿Quién encabeza el ranking de peso ligero?",
  "Cuéntame una curiosidad sobre Conor McGregor",
];

export function MaestroChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/maestro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || (data && typeof data === "object" && "error" in data)) {
        throw new Error(data?.error ?? "No pude obtener respuesta del Maestro.");
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, toolsUsed: data.toolsUsed },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <span className="octagon grid size-11 place-items-center bg-primary font-display text-2xl font-extrabold leading-none text-primary-foreground shadow-[0_0_18px_2px_var(--primary)]">
          M
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold uppercase leading-none tracking-tight text-foreground">
            Maestro de UFC
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            IA con datos en vivo del proyecto
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-5 overflow-y-auto py-6">
        {empty ? (
          <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-10 text-center">
            <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight text-foreground">
              Pregúntale al Maestro
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Récords, estadísticas, rankings, eventos y noticias salen de la base
              de datos real. La historia y las curiosidades, de su conocimiento de MMA.
            </p>
            <div className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition hover:border-primary/40 hover:bg-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={i} message={m} />)
        )}

        {loading ? (
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <span className="octagon grid size-7 shrink-0 place-items-center bg-primary font-display text-sm font-extrabold text-primary-foreground">
              M
            </span>
            <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em]">
              <Loader2 className="size-3.5 animate-spin" />
              El Maestro está pensando…
            </span>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-border pt-4"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Pregunta lo que quieras de UFC/MMA…"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
            disabled={loading}
          />
          <Button
            type="submit"
            size="lg"
            className="h-11 shrink-0"
            disabled={loading || !input.trim()}
          >
            <SendHorizonal className="size-4" />
            <span className="sr-only">Enviar</span>
          </Button>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          Enter para enviar · Shift+Enter para salto de línea
        </p>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMsg }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <span className="octagon mt-0.5 grid size-7 shrink-0 place-items-center bg-primary font-display text-sm font-extrabold text-primary-foreground">
        M
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "max-w-none rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm leading-7 text-foreground",
            "[&_a]:font-medium [&_a]:text-primary [&_a]:underline",
            "[&_strong]:font-semibold [&_strong]:text-foreground",
            "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
            "[&_p]:my-0 [&_p+p]:mt-3",
            "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
            "[&_h1]:mt-2 [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold",
            "[&_table]:my-2 [&_table]:w-full [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:px-2 [&_td]:py-1",
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        {message.toolsUsed && message.toolsUsed.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.toolsUsed.map((t) => (
              <span
                key={t}
                className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary"
              >
                {TOOL_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

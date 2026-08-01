import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import {
  motivoDeCorte,
  PRESUPUESTO_POR_DEFECTO,
  sumarUso,
} from "@/lib/maestro/presupuesto";
import { MAESTRO_SYSTEM_PROMPT, MAESTRO_TOOLS } from "@/lib/maestro/prompt";
import {
  chatRequestSchema,
  clientIpFromHeaders,
  isAllowedOrigin,
  normalizeConversation,
} from "@/lib/maestro/security";
import { runMaestroTool } from "@/lib/maestro/tools";
import { checkRateLimit } from "@/lib/rate-limit";

// pg necesita Node, no Edge.
export const runtime = "nodejs";

// Techo de la función. Sin esto se quedaba en el de la plataforma, que es más
// corto que lo que esta ruta puede tardar: hasta 7 llamadas al modelo con
// timeout de 30 s cada una son 210 s teóricos. La función moría en el límite
// DESPUÉS de haber pagado las llamadas — se gastaba y no se entregaba nada.
// El corte de verdad lo pone el presupuesto de `presupuesto.ts`, que para a los
// 45 s y devuelve lo que haya; esto es solo el margen que lo hace posible.
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
// 6 vueltas de tools cubren los flujos multi-paso (buscar -> ficha -> historial)
// sin permitir que el modelo dispare llamadas a Anthropic en bucle (coste/abuso).
const MAX_TOOL_ITERATIONS = 6;

// El prefijo estable (tools + system) se reenvía en CADA vuelta de tools (hasta 6)
// y en cada turno de la conversación. Con cache_control en el último bloque de
// system, Anthropic cachea tools+system juntos: la 1ª petición los escribe (~1.25x)
// y las siguientes los leen (~0.1x), recortando el coste del Maestro.
const MAESTRO_SYSTEM: Anthropic.TextBlockParam[] = [
  { type: "text", text: MAESTRO_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
];

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  // 1) Solo peticiones desde el propio origen (anti-CSRF / hotlinking).
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  const allowLoopback = process.env.NODE_ENV !== "production";
  if (!isAllowedOrigin(origin, request.headers.get("host"), allowLoopback)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  // 2) Rate-limit por IP (best-effort en memoria). Antes de parsear el body
  // para que un flood de peticiones inválidas también quede limitado.
  const ip = clientIpFromHeaders(request.headers);
  const limit = await checkRateLimit(`maestro:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Vas demasiado rápido. Espera unos segundos e inténtalo de nuevo." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  // 3) Límites de entrada y saneado del historial (roles, tamaño). El system
  // prompt NUNCA viene del cliente: se inyecta abajo desde el servidor.
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "El Maestro no está disponible ahora mismo (falta configuración)." },
      { status: 503 },
    );
  }

  const client = new Anthropic({ apiKey });
  // Anthropic exige que el primer turno sea "user"; normalizamos por si la
  // ventana del historial quedó empezando por un turno "assistant".
  const conversation = normalizeConversation(parsed.data.messages);
  const messages: Anthropic.MessageParam[] = conversation.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const toolsUsed: string[] = [];

  // Presupuesto de la petición. `MAX_TOOL_ITERATIONS` acota las VUELTAS, que no
  // es lo mismo que el gasto: seis vueltas baratas y seis carísimas cuentan
  // igual. Esto mide lo que de verdad se consume, en tokens y en segundos.
  const inicio = Date.now();
  let tokensGastados = 0;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      // Se comprueba ANTES de llamar: hacerlo después serviría para el informe,
      // no para evitar el gasto, que es de lo que se trata.
      const corte = motivoDeCorte(
        { tokens: tokensGastados, msTranscurridos: Date.now() - inicio },
        PRESUPUESTO_POR_DEFECTO,
      );
      if (corte) {
        console.warn(
          `[maestro] corte por ${corte}: ${tokensGastados} tokens, ${Date.now() - inicio} ms, ${i} vueltas`,
        );
        return NextResponse.json({
          reply:
            "La consulta se ha alargado más de la cuenta y he tenido que parar. Prueba a preguntarme algo más concreto.",
          toolsUsed: [...new Set(toolsUsed)],
        });
      }

      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: 2048,
          system: MAESTRO_SYSTEM,
          tools: MAESTRO_TOOLS,
          messages,
        },
        { timeout: 30_000 },
      );
      tokensGastados = sumarUso(tokensGastados, response.usage);

      if (response.stop_reason !== "tool_use") {
        return NextResponse.json({
          reply: extractText(response.content) || "No he podido generar una respuesta.",
          toolsUsed: [...new Set(toolsUsed)],
        });
      }

      // Preservar el turno del asistente (incluye los bloques tool_use) y resolver cada herramienta.
      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        toolsUsed.push(block.name);
        let content: string;
        let isError = false;
        try {
          content = JSON.stringify(await runMaestroTool(block.name, block.input));
        } catch (err) {
          isError = true;
          content = JSON.stringify({
            error: err instanceof Error ? err.message : "Error ejecutando la herramienta.",
          });
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content,
          is_error: isError,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    // Se agotaron las iteraciones: pedir respuesta final sin más herramientas.
    const finalResponse = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 2048,
        system: MAESTRO_SYSTEM_PROMPT,
        tools: MAESTRO_TOOLS,
        tool_choice: { type: "none" },
        messages,
      },
      { timeout: 30_000 },
    );
    tokensGastados = sumarUso(tokensGastados, finalResponse.usage);
    console.info(
      `[maestro] ${tokensGastados} tokens, ${Date.now() - inicio} ms, herramientas: ${[...new Set(toolsUsed)].join(",") || "ninguna"}`,
    );

    return NextResponse.json({
      reply:
        extractText(finalResponse.content) ||
        "He consultado bastante pero no logré cerrar la respuesta. ¿Puedes reformular la pregunta?",
      toolsUsed: [...new Set(toolsUsed)],
    });
  } catch (err) {
    console.error("[maestro] error:", err);
    return NextResponse.json(
      { error: "El Maestro tuvo un problema procesando tu pregunta. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}

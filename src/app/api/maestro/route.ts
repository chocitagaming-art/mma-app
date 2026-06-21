import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";

import { MAESTRO_SYSTEM_PROMPT, MAESTRO_TOOLS } from "@/lib/maestro/prompt";
import { runMaestroTool } from "@/lib/maestro/tools";

// pg necesita Node, no Edge.
export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 6;

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
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
  const messages: Anthropic.MessageParam[] = parsed.data.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const toolsUsed: string[] = [];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: 2048,
          system: MAESTRO_SYSTEM_PROMPT,
          tools: MAESTRO_TOOLS,
          messages,
        },
        { timeout: 30_000 },
      );

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

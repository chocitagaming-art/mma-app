import { z } from "zod";

// Validación de entrada del endpoint del Maestro. Lo compartido (origen, IP y
// rate-limit en memoria) vive en `@/lib/request-security`.

// --- 1) Validación / sanitización de entrada --------------------------------

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY_TURNS = 16;
export const MAX_TOTAL_CHARS = 12_000;

// Solo se aceptan turnos de usuario/asistente. El rol "system" NUNCA viene del
// cliente: el system prompt lo fija siempre el servidor (anti prompt-injection).
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const chatRequestSchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(MAX_HISTORY_TURNS),
  })
  .strict()
  .superRefine((data, ctx) => {
    const total = data.messages.reduce((sum, m) => sum + m.content.length, 0);
    if (total > MAX_TOTAL_CHARS) {
      ctx.addIssue({ code: "custom", message: "El historial es demasiado largo." });
    }
    if (data.messages[data.messages.length - 1]?.role !== "user") {
      ctx.addIssue({ code: "custom", message: "El último mensaje debe ser del usuario." });
    }
  });

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// --- 2) Normalización del historial para la API de Anthropic ----------------

/**
 * Anthropic exige que el primer turno sea de rol "user". Tras recortar la
 * ventana del historial puede quedar un turno "assistant" al principio; lo
 * descartamos para no provocar un 400. El schema garantiza que el último turno
 * es "user", así que el resultado nunca queda vacío.
 */
export function normalizeConversation<T extends { role: "user" | "assistant" }>(
  messages: T[],
): T[] {
  let start = 0;
  while (start < messages.length && messages[start].role !== "user") start++;
  return messages.slice(start);
}

import { spawn } from "node:child_process";
import { join } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePredictionExplanation, type PredictionResponse } from "@/lib/prediction";

export const runtime = "nodejs";

const requestSchema = z.object({
  redFighterId: z.number().int().positive(),
  blueFighterId: z.number().int().positive(),
});

function runPredictionScript(redFighterId: number, blueFighterId: number) {
  const ingestaRoot = join(process.cwd(), "..", "mma-ingesta");
  const scriptPath = join(ingestaRoot, "src", "prediction", "api.py");

  return new Promise<string>((resolve, reject) => {
    const child = spawn("python", [scriptPath, "--red", String(redFighterId), "--blue", String(blueFighterId)], {
      cwd: ingestaRoot,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Prediction script exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid fighter IDs.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.redFighterId === parsed.data.blueFighterId) {
      return NextResponse.json(
        { error: "Choose two different fighters." },
        { status: 400 },
      );
    }

    const raw = await runPredictionScript(parsed.data.redFighterId, parsed.data.blueFighterId);
    const prediction = JSON.parse(raw) as Omit<PredictionResponse, "explanation" | "explanationSource">;
    const explanation = await generatePredictionExplanation(prediction);

    return NextResponse.json({
      ...prediction,
      ...explanation,
    } satisfies PredictionResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Prediction service failed unexpectedly.";
    const status = message.includes("Insufficient fighter history") ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
/**
 * Consumer side of the shared /predict contract.
 *
 * The two repos ship their own CI, so a rename inside mma-ingesta's `api.predict`
 * passes green there and silently breaks this app: we would read a key that no
 * longer exists and paint a hole or "NaN%" with no error anywhere.
 *
 * `__fixtures__/predict-response.json` is a byte-identical copy of
 * `mma-ingesta/tests/contracts/predict_response.json`, captured from the live
 * service. That repo pins its producer against the same document, and its
 * `test_both_repos_hold_the_same_contract` fails if the copies ever drift.
 *
 * If this fails, the contract changed: update both copies deliberately.
 */
import { describe, expect, it } from "vitest";

import contract from "@/lib/__fixtures__/predict-response.json";
import { buildMethodBars } from "@/lib/method-prediction";
import { parsePredictionPayload } from "@/lib/prediction-schema";

describe("contrato de /predict", () => {
  it("el parser acepta la respuesta real del microservicio", () => {
    const result = parsePredictionPayload(contract);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Sin avisos: un aviso significaría que el método se descartó por venir mal.
    expect(result.warning).toBeUndefined();
  });

  it("los campos que la UI pinta llegan con el tipo esperado", () => {
    const result = parsePredictionPayload(contract);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data } = result;

    expect(data.redProbability + data.blueProbability).toBeCloseTo(1, 9);
    expect(data.topFeatures.length).toBeGreaterThan(0);
    expect(typeof data.lowConfidence).toBe("boolean");
    expect(data.context.matchupDate).toEqual(expect.any(String));
    expect(data.fighters.red.name).toEqual(expect.any(String));
    expect(data.fighters.blue.name).toEqual(expect.any(String));
  });

  it("las barras de método se construyen a partir del contrato", () => {
    const result = parsePredictionPayload(contract);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bars = buildMethodBars(result.data.methodPrediction);
    expect(bars).not.toBeNull();
    expect(bars).toHaveLength(3);
    // Ordenadas de mayor a menor, que es como se pintan.
    const probabilities = bars!.map((bar) => bar.probability);
    expect([...probabilities].sort((a, b) => b - a)).toEqual(probabilities);
    expect(probabilities.reduce((total, value) => total + value, 0)).toBeCloseTo(1, 2);
    // Exactamente una barra marcada como la predicha.
    expect(bars!.filter((bar) => bar.isPredicted)).toHaveLength(1);
  });

  it("los campos opcionales del contrato siguen presentes", () => {
    // featureContributions y methodPrediction son opcionales en el tipo (un
    // bundle antiguo puede no traerlos), pero el servicio actual SÍ los manda:
    // si desaparecieran del contrato querría decir que el modelo se revirtió.
    const raw = contract as unknown as Record<string, unknown>;
    expect(raw.featureContributions).toBeTruthy();
    expect(raw.methodPrediction).toBeTruthy();
    expect(raw.modelTrainedAt).toEqual(expect.any(String));
  });
});

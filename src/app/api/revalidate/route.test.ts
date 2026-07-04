import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: el mock se declara antes de que vi.mock (hoisted) lo capture,
// evitando el ReferenceError clásico de "acceso antes de la inicialización".
const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { POST } from "./route";

const SECRET = "super-secreto-de-pruebas";

function makeRequest(authorization?: string) {
  return new Request("http://localhost/api/revalidate", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  revalidatePathMock.mockClear();
});

describe("POST /api/revalidate", () => {
  it("responde 503 si REVALIDATE_SECRET no está configurado", async () => {
    vi.stubEnv("REVALIDATE_SECRET", undefined);

    const response = await POST(makeRequest(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBeDefined();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("responde 401 con un secreto incorrecto", async () => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);

    const response = await POST(makeRequest("Bearer secreto-equivocado"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBeDefined();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("responde 401 sin cabecera Authorization", async () => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("responde 401 si el esquema no es Bearer", async () => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);

    const response = await POST(makeRequest(`Basic ${SECRET}`));

    expect(response.status).toBe(401);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalida la home con el secreto correcto", async () => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);

    const response = await POST(makeRequest(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ revalidated: true, path: "/" });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
  });
});

import { permanentRedirect } from "next/navigation";

type PredictPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

// /predict has been merged into /enfrentamiento. Permanently redirect and keep
// the existing ?red=&blue= corner params untouched.
export default async function PredictPage({ searchParams }: PredictPageProps) {
  const params = await searchParams;
  const redirectParams = new URLSearchParams();

  const red = getSingleValue(params.red);
  const blue = getSingleValue(params.blue);

  if (red) {
    redirectParams.set("red", red);
  }
  if (blue) {
    redirectParams.set("blue", blue);
  }

  const query = redirectParams.toString();
  permanentRedirect(`/enfrentamiento${query ? `?${query}` : ""}`);
}

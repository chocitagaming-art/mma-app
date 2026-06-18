import { permanentRedirect } from "next/navigation";

type ComparePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

// /compare has been merged into /enfrentamiento. Permanently redirect while
// remapping the legacy ?a=&b= params to the new ?red=&blue= corner semantics.
export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const redirectParams = new URLSearchParams();

  const a = getSingleValue(params.a);
  const b = getSingleValue(params.b);

  if (a) {
    redirectParams.set("red", a);
  }
  if (b) {
    redirectParams.set("blue", b);
  }

  const query = redirectParams.toString();
  permanentRedirect(`/enfrentamiento${query ? `?${query}` : ""}`);
}

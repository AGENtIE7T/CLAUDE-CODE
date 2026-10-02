import { ResultsView } from "@/components/ResultsView";

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultsView id={decodeURIComponent(id)} />;
}

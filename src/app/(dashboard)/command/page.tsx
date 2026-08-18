import { PageHeader } from "@/components/page-header";
import { CommandBox } from "./command-box";

export default function CommandPage() {
  return (
    <>
      <PageHeader
        eyebrow="SEO · Command"
        title="Tell the Command Center what to do"
        lead="Type an instruction in plain English. It becomes a structured, reviewable plan — audit by default, preview for changes, and explicit approval before anything is written. Prohibited SEO tactics are refused with a legitimate alternative."
      />
      <CommandBox />
    </>
  );
}

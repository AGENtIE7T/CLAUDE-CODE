import { Nav } from "@/components/nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <div className="flex-1 px-8 py-10">{children}</div>
    </div>
  );
}

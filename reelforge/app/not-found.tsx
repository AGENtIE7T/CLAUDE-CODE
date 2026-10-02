import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card py-10 text-center">
      <p className="text-lg font-bold">Ye page exist nahi karta.</p>
      <Link href="/" className="btn-primary mt-4">Go to Generate</Link>
    </div>
  );
}

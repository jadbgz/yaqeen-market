import Link from "next/link";

export function AccountHeader({ back = "/compte", label = "Retour à mon compte" }: { back?: string; label?: string }) {
  return <header className="member-header">
    <Link href="/" className="brand-mark">yaqeen<span>✦</span></Link>
    <Link href={back}>← {label}</Link>
  </header>;
}

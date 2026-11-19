import Link from "next/link";

/** Reading layout for text pages (privacy, terms, about). */
export function Doc({ title, intro, updated, draft = false, children }: { title: string; intro?: string; updated?: string; draft?: boolean; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
      {intro && <p className="mt-4 text-lg text-muted">{intro}</p>}
      {updated && <p className="mt-2 text-sm text-muted">Last updated {updated}</p>}
      {draft && (
        <p role="note" className="mt-6 rounded-2xl bg-warning-bg px-4 py-3 text-sm font-bold text-warning">
          Draft for review. This text describes how RYDO works today. Have your legal team review it before launch.
        </p>
      )}
      <div className="mt-10 flex flex-col gap-8">{children}</div>
      <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
        Questions? <Link href="/contact" className="font-extrabold text-ink underline">Contact us</Link>.
      </p>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-extrabold">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-[15px] leading-relaxed text-ink/85 [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">{children}</div>
    </section>
  );
}

const foundations = [
  "Next.js com App Router e TypeScript",
  "Estrutura inicial para integracao com APIs do Cartola",
  "Pipeline basica com lint, build e testes",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f6f7ef_0%,_#eef3e4_32%,_#d5e7b6_100%)] px-6 py-16 text-slate-950">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-12 rounded-[2rem] border border-black/10 bg-white/75 p-8 shadow-[0_30px_90px_rgba(56,77,20,0.12)] backdrop-blur md:p-12">
        <div className="flex flex-col gap-6">
          <span className="w-fit rounded-full border border-emerald-900/15 bg-emerald-700 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
            Bootstrap inicial
          </span>
          <div className="flex max-w-3xl flex-col gap-4">
            <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
              Cartola Oracle
            </h1>
            <p className="text-base leading-8 text-slate-700 md:text-lg">
              A aplicacao base esta pronta para receber contratos internos,
              cliente HTTP do Cartola e o algoritmo de montagem do time.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {foundations.map((item) => (
            <article
              key={item}
              className="rounded-[1.5rem] border border-black/8 bg-slate-950 px-5 py-6 text-slate-50"
            >
              <p className="text-sm uppercase tracking-[0.2em] text-lime-300">
                pronto
              </p>
              <h2 className="mt-4 text-xl font-medium leading-8">{item}</h2>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

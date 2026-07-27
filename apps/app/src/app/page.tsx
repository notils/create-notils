import { ContactForm } from "./contact-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black sm:px-16">
      <div className="flex w-full max-w-3xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-none font-semibold">create-notils</h1>
          <p className="text-muted-foreground">
            A production-ready Next.js starter — Tailwind v4, shadcn/ui on Base UI, and a
            schema-driven auth + form stack, ready to build on.
          </p>
        </div>
        <ContactForm />
      </div>
    </main>
  );
}

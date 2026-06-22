import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Users, BarChart3, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/app" });
  },
  component: Landing,
  head: () => ({
    meta: [
      { title: "Onboard — Onboarding de funcionários simples e mensurável" },
      {
        name: "description",
        content:
          "Crie trilhas de aprendizado, organize módulos e acompanhe o progresso dos seus novos colaboradores em um só lugar.",
      },
      { property: "og:title", content: "Onboard — Onboarding de funcionários" },
      {
        property: "og:description",
        content: "Trilhas, módulos e quizzes para receber novos colaboradores com excelência.",
      },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">Onboard</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Cadastrar empresa</Link>
            </Button>
          </div>
        </div>
      </header>

      <section
        className="px-4 py-20 md:py-28"
        style={{ background: "var(--gradient-soft)" }}
      >
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Plataforma completa de onboarding
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-6xl">
            Receba novos colaboradores com{" "}
            <span className="text-primary">trilhas estruturadas</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Crie trilhas de aprendizado, organize módulos com quizzes e acompanhe o
            progresso de cada colaborador em tempo real.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Começar agora</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Já tenho conta</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: BookOpen,
              title: "Trilhas e módulos",
              desc: "Estruture o conteúdo em trilhas com módulos sequenciais de leitura.",
            },
            {
              icon: CheckCircle2,
              title: "Quizzes ao final",
              desc: "Valide o aprendizado com quizzes de múltipla escolha em cada módulo.",
            },
            {
              icon: BarChart3,
              title: "Acompanhamento real",
              desc: "Painel para gestores acompanharem o avanço de cada colaborador.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border bg-card p-6"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/30 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <Users className="mx-auto mb-4 h-8 w-8 text-primary" />
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">
            Pronto para transformar seu onboarding?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Cadastre sua empresa em menos de 1 minuto e comece a criar trilhas hoje.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/signup">Cadastrar empresa</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Onboard
      </footer>
    </div>
  );
}

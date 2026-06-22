import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Users, CheckCircle2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

interface Stats {
  tracks: number;
  members: number;
  completedModules: number;
  totalAssignedModules: number;
}

function AppIndex() {
  const { ctx, user } = useAuth();
  const isStaff = ctx?.roles.some((r) => r === "admin" || r === "manager");

  if (isStaff) return <StaffOverview />;
  return <EmployeeTracks userId={user?.id ?? ""} />;
}

function StaffOverview() {
  const { ctx } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!ctx?.companyId) return;
    const companyId = ctx.companyId;
    (async () => {
      const [{ count: tracksCount }, { count: membersCount }] = await Promise.all([
        supabase.from("tracks").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      ]);

      const { data: tracks } = await supabase.from("tracks").select("id").eq("company_id", companyId);
      const trackIds = (tracks ?? []).map((t) => t.id);
      let completed = 0;
      let total = 0;
      if (trackIds.length) {
        const { data: modules } = await supabase.from("modules").select("id, track_id").in("track_id", trackIds);
        const moduleIds = (modules ?? []).map((m) => m.id);
        const { data: enrollments } = await supabase.from("enrollments").select("user_id, track_id").in("track_id", trackIds);
        for (const e of enrollments ?? []) {
          total += (modules ?? []).filter((m) => m.track_id === e.track_id).length;
        }
        if (moduleIds.length) {
          const { count } = await supabase
            .from("module_progress")
            .select("id", { count: "exact", head: true })
            .in("module_id", moduleIds)
            .eq("completed", true);
          completed = count ?? 0;
        }
      }
      setStats({
        tracks: tracksCount ?? 0,
        members: membersCount ?? 0,
        completedModules: completed,
        totalAssignedModules: total,
      });
    })();
  }, [ctx?.companyId]);

  const pct = stats && stats.totalAssignedModules > 0
    ? Math.round((stats.completedModules / stats.totalAssignedModules) * 100)
    : 0;

  const cards = [
    { label: "Trilhas ativas", value: stats?.tracks ?? "—", icon: BookOpen },
    { label: "Colaboradores", value: stats?.members ?? "—", icon: Users },
    { label: "Módulos concluídos", value: stats?.completedModules ?? "—", icon: CheckCircle2 },
    { label: "Progresso geral", value: stats ? `${pct}%` : "—", icon: TrendingUp },
  ];

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Visão geral</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe o onboarding da sua empresa.</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border bg-card p-6" style={{ boxShadow: "var(--shadow-card)" }}>
        <h2 className="text-base font-semibold text-foreground">Por onde começar</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>1. <Link to="/app/tracks" className="font-medium text-primary hover:underline">Crie uma trilha</Link> de aprendizado.</li>
          <li>2. Adicione módulos com conteúdo e perguntas de quiz.</li>
          <li>3. <Link to="/app/team" className="font-medium text-primary hover:underline">Convide colaboradores</Link> e atribua trilhas.</li>
        </ol>
      </div>
    </div>
  );
}

interface TrackProgress {
  id: string;
  title: string;
  description: string;
  totalModules: number;
  completedModules: number;
}

function EmployeeTracks({ userId }: { userId: string }) {
  const [tracks, setTracks] = useState<TrackProgress[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("track_id, tracks(id, title, description)")
        .eq("user_id", userId);

      const result: TrackProgress[] = [];
      for (const e of enrollments ?? []) {
        const t = e.tracks as { id: string; title: string; description: string } | null;
        if (!t) continue;
        const { data: modules } = await supabase.from("modules").select("id").eq("track_id", t.id);
        const moduleIds = (modules ?? []).map((m) => m.id);
        let completed = 0;
        if (moduleIds.length) {
          const { count } = await supabase
            .from("module_progress")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("completed", true)
            .in("module_id", moduleIds);
          completed = count ?? 0;
        }
        result.push({
          id: t.id,
          title: t.title,
          description: t.description,
          totalModules: moduleIds.length,
          completedModules: completed,
        });
      }
      setTracks(result);
    })();
  }, [userId]);

  const totalModules = (tracks ?? []).reduce((sum, t) => sum + t.totalModules, 0);
  const totalCompleted = (tracks ?? []).reduce((sum, t) => sum + t.completedModules, 0);
  const overallPct = totalModules > 0 ? Math.round((totalCompleted / totalModules) * 100) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Minhas trilhas</h1>
      <p className="mt-1 text-sm text-muted-foreground">Continue sua jornada de onboarding.</p>

      {tracks && tracks.length > 0 && (
        <div className="mt-6 rounded-xl border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Progresso geral</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {totalCompleted} de {totalModules} módulos concluídos
              </p>
            </div>
            <span className="text-2xl font-bold text-primary">{overallPct}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      {tracks === null ? (
        <p className="mt-8 text-sm text-muted-foreground">Carregando...</p>
      ) : tracks.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Você ainda não foi atribuído a nenhuma trilha.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {tracks.map((t) => {
            const pct = t.totalModules > 0 ? Math.round((t.completedModules / t.totalModules) * 100) : 0;
            return (
              <Link
                key={t.id}
                to="/app/learn/$trackId"
                params={{ trackId: t.id }}
                className="group rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <h3 className="text-base font-semibold text-foreground group-hover:text-primary">{t.title}</h3>
                {t.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t.completedModules} de {t.totalModules} módulos</span>
                    <span className="font-medium text-foreground">{pct}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

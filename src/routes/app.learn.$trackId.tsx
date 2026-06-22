import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, Circle, Lock } from "lucide-react";

export const Route = createFileRoute("/app/learn/$trackId")({
  component: LearnTrack,
});

interface Track { id: string; title: string; description: string }
interface ModuleItem { id: string; title: string; position: number; completed: boolean; quiz_count: number }

function LearnTrack() {
  const { trackId } = Route.useParams();
  const { user } = useAuth();
  const [track, setTrack] = useState<Track | null>(null);
  const [modules, setModules] = useState<ModuleItem[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: t } = await supabase.from("tracks").select("id, title, description").eq("id", trackId).maybeSingle();
      setTrack(t);
      const { data: ms } = await supabase
        .from("modules")
        .select("id, title, position, quiz_questions(count)")
        .eq("track_id", trackId)
        .order("position");
      const moduleIds = (ms ?? []).map((m) => m.id);
      const { data: progress } = moduleIds.length
        ? await supabase.from("module_progress").select("module_id, completed").eq("user_id", user.id).in("module_id", moduleIds)
        : { data: [] as { module_id: string; completed: boolean }[] };
      const completedSet = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.module_id));
      setModules(
        (ms ?? []).map((m) => ({
          id: m.id, title: m.title, position: m.position,
          completed: completedSet.has(m.id),
          quiz_count: (m.quiz_questions as { count: number }[] | null)?.[0]?.count ?? 0,
        }))
      );
    })();
  }, [trackId, user]);

  if (!track) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const completedCount = modules.filter((m) => m.completed).length;
  const pct = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

  return (
    <div>
      <Link to="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Minhas trilhas
      </Link>

      <div className="mt-3">
        <h1 className="text-2xl font-bold text-foreground">{track.title}</h1>
        {track.description && <p className="mt-1 text-sm text-muted-foreground">{track.description}</p>}

        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{completedCount}/{modules.length} ({pct}%)</span>
        </div>
      </div>

      <h2 className="mt-8 text-base font-semibold text-foreground">Módulos</h2>
      {modules.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Esta trilha ainda não tem módulos.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {modules.map((m, idx) => {
            const prevDone = idx === 0 || modules[idx - 1].completed;
            const locked = !prevDone && !m.completed;
            return (
              <li key={m.id}>
                {locked ? (
                  <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4 text-muted-foreground">
                    <Lock className="h-5 w-5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{idx + 1}. {m.title}</div>
                      <div className="text-xs">Conclua o módulo anterior para desbloquear</div>
                    </div>
                  </div>
                ) : (
                  <Link
                    to="/app/learn/$trackId/$moduleId"
                    params={{ trackId, moduleId: m.id }}
                    className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
                    style={{ boxShadow: "var(--shadow-card)" }}
                  >
                    {m.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{idx + 1}. {m.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.quiz_count > 0 ? `${m.quiz_count} pergunta(s) no final` : "Apenas leitura"}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-primary">
                      {m.completed ? "Revisar" : "Iniciar"}
                    </span>
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

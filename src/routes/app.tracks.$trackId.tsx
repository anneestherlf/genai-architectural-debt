import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, FileText, HelpCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tracks/$trackId")({
  component: TrackDetailPage,
});

interface Track { id: string; title: string; description: string }
interface Module { id: string; title: string; content: string; position: number; quiz_count: number }

function TrackDetailPage() {
  const { trackId } = Route.useParams();
  const navigate = useNavigate();
  const [track, setTrack] = useState<Track | null>(null);
  const [modules, setModules] = useState<Module[]>([]);

  const load = async () => {
    const { data: t } = await supabase.from("tracks").select("id, title, description").eq("id", trackId).maybeSingle();
    setTrack(t);
    const { data: ms } = await supabase
      .from("modules")
      .select("id, title, content, position, quiz_questions(count)")
      .eq("track_id", trackId)
      .order("position", { ascending: true });
    setModules(
      (ms ?? []).map((m) => ({
        id: m.id, title: m.title, content: m.content, position: m.position,
        quiz_count: (m.quiz_questions as { count: number }[] | null)?.[0]?.count ?? 0,
      }))
    );
  };
  useEffect(() => { load(); }, [trackId]);

  const remove = async (id: string) => {
    if (!confirm("Excluir este módulo?")) return;
    const { error } = await supabase.from("modules").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Módulo excluído");
    load();
  };

  if (!track) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div>
      <Link to="/app/tracks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para trilhas
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{track.title}</h1>
          {track.description && <p className="mt-1 text-sm text-muted-foreground">{track.description}</p>}
        </div>
        <NewModuleDialog trackId={trackId} nextPosition={modules.length} onCreated={load} />
      </div>

      <h2 className="mt-8 text-base font-semibold text-foreground">Módulos</h2>
      {modules.length === 0 ? (
        <div className="mt-4 rounded-xl border bg-card p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Adicione o primeiro módulo desta trilha.</p>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {modules.map((m, idx) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                  {idx + 1}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{m.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <HelpCircle className="h-3 w-3" /> {m.quiz_count} pergunta(s)
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/modules/$moduleId", params: { moduleId: m.id } })}>
                  Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(m.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NewModuleDialog({ trackId, nextPosition, onCreated }: { trackId: string; nextPosition: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("modules").insert({
      track_id: trackId, title, content, position: nextPosition,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Módulo criado");
    setOpen(false); setTitle(""); setContent("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />Novo módulo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Novo módulo</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="m-title">Título</Label>
            <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="m-content">Conteúdo</Label>
            <Textarea id="m-content" value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="mt-1" placeholder="Escreva o conteúdo do módulo aqui..." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

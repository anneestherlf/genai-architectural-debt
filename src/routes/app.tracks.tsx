import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, BookOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tracks")({
  component: TracksPage,
});

interface Track {
  id: string;
  title: string;
  description: string;
  module_count: number;
}

function TracksPage() {
  const { ctx } = useAuth();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!ctx?.companyId) return;
    const { data } = await supabase
      .from("tracks")
      .select("id, title, description, modules(count)")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false });
    setTracks(
      (data ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        module_count: (t.modules as { count: number }[] | null)?.[0]?.count ?? 0,
      })),
    );
  };

  useEffect(() => { load(); }, [ctx?.companyId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctx?.companyId) return;
    setLoading(true);
    const { error } = await supabase.from("tracks").insert({
      company_id: ctx.companyId,
      title,
      description,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setOpen(false); setTitle(""); setDescription("");
    toast.success("Trilha criada!");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta trilha e todos os módulos?")) return;
    const { error } = await supabase.from("tracks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Trilha excluída");
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trilhas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crie e gerencie as trilhas de onboarding.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nova trilha</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova trilha</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div>
                <Label htmlFor="t-title">Título</Label>
                <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="t-desc">Descrição</Label>
                <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {tracks.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma trilha criada ainda.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t) => (
            <div key={t.id} className="group rounded-xl border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-start justify-between gap-2">
                <Link to="/app/tracks/$trackId" params={{ trackId: t.id }} className="flex-1">
                  <h3 className="text-base font-semibold text-foreground hover:text-primary">{t.title}</h3>
                  {t.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                </Link>
                <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 text-xs text-muted-foreground">{t.module_count} módulo(s)</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/modules/$moduleId")({
  component: ModuleEditPage,
});

interface Mod { id: string; title: string; content: string; track_id: string }
interface Quiz {
  id: string; question: string; option_a: string; option_b: string;
  option_c: string; option_d: string; correct_option: number; position: number;
}

function ModuleEditPage() {
  const { moduleId } = Route.useParams();
  const [mod, setMod] = useState<Mod | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: m } = await supabase.from("modules").select("id, title, content, track_id").eq("id", moduleId).maybeSingle();
    if (m) { setMod(m); setTitle(m.title); setContent(m.content); }
    const { data: q } = await supabase.from("quiz_questions").select("*").eq("module_id", moduleId).order("position");
    setQuizzes(q ?? []);
  };
  useEffect(() => { load(); }, [moduleId]);

  const saveModule = async () => {
    setSaving(true);
    const { error } = await supabase.from("modules").update({ title, content }).eq("id", moduleId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Módulo salvo");
  };

  const removeQuiz = async (id: string) => {
    if (!confirm("Excluir esta pergunta?")) return;
    const { error } = await supabase.from("quiz_questions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (!mod) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div>
      <Link to="/app/tracks/$trackId" params={{ trackId: mod.track_id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para trilha
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Editar módulo</h1>
        <Button onClick={saveModule} disabled={saving}>
          <Save className="mr-2 h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <div className="mt-6 space-y-4 rounded-xl border bg-card p-6" style={{ boxShadow: "var(--shadow-card)" }}>
        <div>
          <Label htmlFor="title">Título</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="content">Conteúdo</Label>
          <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={14} className="mt-1" />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Quiz ({quizzes.length})</h2>
        <NewQuizDialog moduleId={moduleId} nextPosition={quizzes.length} onCreated={load} />
      </div>

      {quizzes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Adicione perguntas para validar o aprendizado.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {quizzes.map((q, idx) => (
            <li key={q.id} className="rounded-xl border bg-card p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-xs font-medium text-muted-foreground">Pergunta {idx + 1}</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{q.question}</div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {[q.option_a, q.option_b, q.option_c, q.option_d].map((opt, i) => (
                      <li key={i} className={i === q.correct_option ? "text-success font-medium" : "text-muted-foreground"}>
                        {String.fromCharCode(65 + i)}. {opt} {i === q.correct_option && "✓"}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeQuiz(q.id)}>
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

function NewQuizDialog({ moduleId, nextPosition, onCreated }: { moduleId: string; nextPosition: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState("0");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("quiz_questions").insert({
      module_id: moduleId,
      question,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: Number(correct),
      position: nextPosition,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pergunta adicionada");
    setOpen(false);
    setQuestion(""); setOptions(["", "", "", ""]); setCorrect("0");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova pergunta</Button>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Nova pergunta</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="q">Pergunta</Label>
            <Textarea id="q" value={question} onChange={(e) => setQuestion(e.target.value)} required className="mt-1" />
          </div>
          {options.map((opt, i) => (
            <div key={i}>
              <Label>Alternativa {String.fromCharCode(65 + i)}</Label>
              <Input
                value={opt}
                onChange={(e) => {
                  const c = [...options]; c[i] = e.target.value; setOptions(c);
                }}
                required className="mt-1"
              />
            </div>
          ))}
          <div>
            <Label>Resposta correta</Label>
            <Select value={correct} onValueChange={setCorrect}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["A", "B", "C", "D"].map((l, i) => (
                  <SelectItem key={l} value={String(i)}>Alternativa {l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Adicionar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

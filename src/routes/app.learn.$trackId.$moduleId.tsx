import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/learn/$trackId/$moduleId")({
  component: LearnModule,
});

interface Mod { id: string; title: string; content: string; track_id: string }
interface Quiz {
  id: string; question: string; option_a: string; option_b: string;
  option_c: string; option_d: string; correct_option: number;
}

function LearnModule() {
  const { trackId, moduleId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mod, setMod] = useState<Mod | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [completed, setCompleted] = useState(false);
  const [phase, setPhase] = useState<"reading" | "quiz" | "done">("reading");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: m } = await supabase.from("modules").select("id, title, content, track_id").eq("id", moduleId).maybeSingle();
      setMod(m);
      const { data: q } = await supabase.from("quiz_questions").select("*").eq("module_id", moduleId).order("position");
      setQuizzes(q ?? []);
      const { data: prog } = await supabase.from("module_progress").select("completed").eq("user_id", user.id).eq("module_id", moduleId).maybeSingle();
      if (prog?.completed) {
        setCompleted(true);
        setPhase("done");
      }
    })();
  }, [moduleId, user]);

  const markComplete = async () => {
    if (!user) return;
    const { error } = await supabase.from("module_progress").upsert(
      { user_id: user.id, module_id: moduleId, completed: true, completed_at: new Date().toISOString() },
      { onConflict: "user_id,module_id" },
    );
    if (error) { toast.error(error.message); return; }
    setCompleted(true);
    setPhase("done");
    toast.success("Módulo concluído!");
  };

  const submitQuiz = async () => {
    if (!user) return;
    setSubmitting(true);
    let score = 0;
    for (const q of quizzes) {
      if (answers[q.id] === q.correct_option) score++;
    }
    const total = quizzes.length;
    const passed = score >= Math.ceil(total * 0.7);

    await supabase.from("quiz_attempts").insert({
      user_id: user.id, module_id: moduleId, score, total, passed,
    });

    if (passed) {
      await supabase.from("module_progress").upsert(
        { user_id: user.id, module_id: moduleId, completed: true, completed_at: new Date().toISOString() },
        { onConflict: "user_id,module_id" },
      );
      setCompleted(true);
    }
    setResult({ score, total, passed });
    setPhase("done");
    setSubmitting(false);
  };

  if (!mod) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="max-w-3xl">
      <Link to="/app/learn/$trackId" params={{ trackId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para a trilha
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-foreground">{mod.title}</h1>

      {phase === "reading" && (
        <>
          <article className="mt-6 rounded-xl border bg-card p-8 text-base leading-relaxed text-foreground whitespace-pre-wrap" style={{ boxShadow: "var(--shadow-card)" }}>
            {mod.content || <span className="text-muted-foreground">Sem conteúdo.</span>}
          </article>
          <div className="mt-6 flex justify-end gap-2">
            {quizzes.length > 0 ? (
              <Button onClick={() => setPhase("quiz")}>Ir para o quiz</Button>
            ) : (
              <Button onClick={markComplete} disabled={completed}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {completed ? "Concluído" : "Marcar como concluído"}
              </Button>
            )}
          </div>
        </>
      )}

      {phase === "quiz" && (
        <div className="mt-6 space-y-6">
          {quizzes.map((q, idx) => (
            <div key={q.id} className="rounded-xl border bg-card p-6" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="text-xs font-medium text-muted-foreground">Pergunta {idx + 1} de {quizzes.length}</div>
              <p className="mt-1 text-base font-medium text-foreground">{q.question}</p>
              <div className="mt-4 space-y-2">
                {[q.option_a, q.option_b, q.option_c, q.option_d].map((opt, i) => (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      answers[q.id] === i ? "border-primary bg-primary-soft" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === i}
                      onChange={() => setAnswers({ ...answers, [q.id]: i })}
                      className="accent-primary"
                    />
                    <span className="font-medium">{String.fromCharCode(65 + i)}.</span>
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={submitQuiz} disabled={submitting || Object.keys(answers).length < quizzes.length}>
              {submitting ? "Enviando..." : "Enviar respostas"}
            </Button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-8 rounded-xl border bg-card p-8 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
          {result ? (
            <>
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${result.passed ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-xl font-bold text-foreground">
                {result.passed ? "Parabéns! Módulo concluído." : "Não foi dessa vez."}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Você acertou {result.score} de {result.total} perguntas.
                {!result.passed && " Você precisa de pelo menos 70% para concluir."}
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
              <h2 className="mt-4 text-xl font-bold text-foreground">Módulo já concluído</h2>
            </>
          )}
          <div className="mt-6 flex justify-center gap-2">
            {result && !result.passed && (
              <Button variant="outline" onClick={() => { setAnswers({}); setResult(null); setPhase("quiz"); }}>
                Tentar novamente
              </Button>
            )}
            <Button onClick={() => navigate({ to: "/app/learn/$trackId", params: { trackId } })}>
              Voltar para a trilha
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName },
        },
      });
      if (signUpErr) throw signUpErr;
      const userId = signUpData.user?.id;
      if (!userId) throw new Error("Erro ao criar usuário");

      // Sign in to ensure session for RLS-protected inserts
      if (!signUpData.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
      }

      // Create company
      const { data: company, error: companyErr } = await supabase
        .from("companies")
        .insert({ name: companyName })
        .select()
        .single();
      if (companyErr) throw companyErr;

      // Update profile with company
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ company_id: company.id, full_name: fullName })
        .eq("id", userId);
      if (profileErr) throw profileErr;

      // Assign admin role
      const { error: roleErr } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, company_id: company.id, role: "admin" });
      if (roleErr) throw roleErr;

      toast.success("Empresa criada! Bem-vindo.");
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{ background: "var(--gradient-soft)" }}
    >
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold">Onboard</span>
        </Link>

        <div
          className="rounded-2xl border bg-card p-8"
          style={{ boxShadow: "var(--shadow-elevated)" }}
        >
          <h1 className="text-2xl font-bold text-foreground">Cadastrar empresa</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Você será o administrador da conta.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="company">Nome da empresa</Label>
              <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="name">Seu nome</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-1" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando..." : "Criar empresa"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

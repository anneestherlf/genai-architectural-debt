import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/team")({
  component: TeamPage,
});

interface Member {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
  progress: { completed: number; total: number };
}

interface Track { id: string; title: string }

function TeamPage() {
  const { ctx } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const isAdmin = ctx?.roles.includes("admin");

  const load = async () => {
    if (!ctx?.companyId) return;
    const companyId = ctx.companyId;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("company_id", companyId);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("company_id", companyId);
    const { data: tr } = await supabase.from("tracks").select("id, title").eq("company_id", companyId);
    setTracks(tr ?? []);

    const trackIds = (tr ?? []).map((t) => t.id);
    const { data: modulesAll } = trackIds.length
      ? await supabase.from("modules").select("id, track_id").in("track_id", trackIds)
      : { data: [] as { id: string; track_id: string }[] };

    const result: Member[] = [];
    for (const p of profiles ?? []) {
      const userRoles = (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role);
      const { data: enrolls } = await supabase.from("enrollments").select("track_id").eq("user_id", p.id);
      const enrolledTrackIds = (enrolls ?? []).map((e) => e.track_id);
      const totalModules = (modulesAll ?? []).filter((m) => enrolledTrackIds.includes(m.track_id)).length;
      let completed = 0;
      if (totalModules > 0) {
        const enrolledModuleIds = (modulesAll ?? []).filter((m) => enrolledTrackIds.includes(m.track_id)).map((m) => m.id);
        const { count } = await supabase
          .from("module_progress")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.id)
          .eq("completed", true)
          .in("module_id", enrolledModuleIds);
        completed = count ?? 0;
      }
      result.push({
        id: p.id, full_name: p.full_name || "(sem nome)", email: p.email, roles: userRoles,
        progress: { completed, total: totalModules },
      });
    }
    setMembers(result);
  };

  useEffect(() => { load(); }, [ctx?.companyId]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
          <p className="mt-1 text-sm text-muted-foreground">Convide pessoas e acompanhe o progresso de cada uma.</p>
        </div>
        <InviteDialog onCreated={load} tracks={tracks} canCreateManager={isAdmin ?? false} />
      </div>

      {members.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Convide o primeiro colaborador.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border bg-card" style={{ boxShadow: "var(--shadow-card)" }}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Papel</th>
                <th className="px-4 py-3 font-medium">Progresso</th>
                <th className="px-4 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const pct = m.progress.total > 0 ? Math.round((m.progress.completed / m.progress.total) * 100) : 0;
                return (
                  <tr key={m.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-foreground">{m.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                    <td className="px-4 py-3">
                      {m.roles.map((r) => (
                        <span key={r} className="mr-1 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                          {r === "admin" ? "Admin" : r === "manager" ? "Gestor" : "Colaborador"}
                        </span>
                      ))}
                      {m.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{m.progress.completed}/{m.progress.total}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <AssignDialog userId={m.id} userName={m.full_name} tracks={tracks} onAssigned={load} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InviteDialog({ tracks, onCreated, canCreateManager }: { tracks: Track[]; onCreated: () => void; canCreateManager: boolean }) {
  const { ctx } = useAuth();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "manager">("employee");
  const [trackId, setTrackId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctx?.companyId) return;
    setLoading(true);
    try {
      // Save current session to restore later
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      // Create the user (this will sign them in temporarily)
      const { data: signUp, error: signErr } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
      });
      if (signErr) throw signErr;
      const newUserId = signUp.user?.id;
      if (!newUserId) throw new Error("Erro ao criar usuário");

      // Wait briefly, then ensure we sign back in as admin
      if (currentSession) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
      }

      // Update profile + assign role + enroll
      await supabase.from("profiles").update({ company_id: ctx.companyId, full_name: fullName }).eq("id", newUserId);
      await supabase.from("user_roles").insert({ user_id: newUserId, company_id: ctx.companyId, role });
      if (trackId) {
        await supabase.from("enrollments").insert({ user_id: newUserId, track_id: trackId });
      }

      toast.success("Colaborador adicionado!");
      setOpen(false);
      setFullName(""); setEmail(""); setPassword(""); setRole("employee"); setTrackId("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao convidar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" />Convidar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Convidar colaborador</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Nome completo</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1" /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" /></div>
          <div><Label>Senha temporária</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-1" /></div>
          <div>
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "employee" | "manager")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Colaborador</SelectItem>
                {canCreateManager && <SelectItem value="manager">Gestor</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          {tracks.length > 0 && (
            <div>
              <Label>Atribuir trilha (opcional)</Label>
              <Select value={trackId} onValueChange={setTrackId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  {tracks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Adicionando..." : "Adicionar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ userId, userName, tracks, onAssigned }: { userId: string; userName: string; tracks: Track[]; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [trackId, setTrackId] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!trackId) return;
    setLoading(true);
    const { error } = await supabase.from("enrollments").insert({ user_id: userId, track_id: trackId });
    setLoading(false);
    if (error) {
      if (error.code === "23505") toast.error("Já está matriculado nesta trilha.");
      else toast.error(error.message);
      return;
    }
    toast.success("Trilha atribuída");
    setOpen(false); setTrackId("");
    onAssigned();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="mr-1 h-3 w-3" />Trilha</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Atribuir trilha a {userName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Select value={trackId} onValueChange={setTrackId}>
            <SelectTrigger><SelectValue placeholder="Escolha uma trilha" /></SelectTrigger>
            <SelectContent>
              {tracks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={submit} disabled={loading || !trackId}>{loading ? "Atribuindo..." : "Atribuir"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

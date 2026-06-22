import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { GraduationCap, LayoutDashboard, BookOpen, Users, LogOut } from "lucide-react";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { ctx, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const isStaff = ctx?.roles.some((r) => r === "admin" || r === "manager");

  const nav = isStaff
    ? [
        { to: "/app", label: "Visão geral", icon: LayoutDashboard },
        { to: "/app/tracks", label: "Trilhas", icon: BookOpen },
        { to: "/app/team", label: "Colaboradores", icon: Users },
      ]
    : [
        { to: "/app", label: "Minhas trilhas", icon: BookOpen },
      ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/app" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">Onboard</div>
              <div className="text-xs text-muted-foreground">{ctx?.companyName}</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-foreground">{ctx?.fullName}</div>
              <div className="text-xs text-muted-foreground">
                {ctx?.roles.includes("admin")
                  ? "Administrador"
                  : ctx?.roles.includes("manager")
                  ? "Gestor"
                  : "Colaborador"}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
        <aside className="md:w-56">
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {nav.map((item) => {
              const active = path === item.to || (item.to !== "/app" && path.startsWith(item.to));
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

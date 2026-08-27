import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout;
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="tech-label text-muted-foreground">Loading workbench…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/projects" className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold tracking-tight">MINIM</span>
            <span className="tech-label text-blueprint">plan works</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/" });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

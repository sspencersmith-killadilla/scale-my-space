import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/projects" className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold tracking-tight">SHRINKIFY</span>
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

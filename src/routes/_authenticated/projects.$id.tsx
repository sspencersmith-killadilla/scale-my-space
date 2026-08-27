import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, ImagePlus, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generatePlan } from "@/lib/plans.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Elevation, PlanScaleBadge } from "@/components/Elevation";
import { PanelLayout } from "@/components/PanelLayout";
import { buildPlanPdf } from "@/lib/plan-pdf";
import {
  MATERIAL_OPTIONS,
  SCALE_PRESETS,
  THICKNESS_OPTIONS,
  buildCutList,
  formatFeetInches,
  formatInches,
  modelOverall,
  normalizePlanModel,
  sheetAreaSqIn,
  type FaceKey,
  type PlanModel,
  type ScaleSettings,
} from "@/lib/plan-model";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({
    meta: [
      { title: "Plan sheets — Minim" },
      {
        name: "description",
        content: "Cut list, scaled elevations, cutting layout and printable PDF for your model.",
      },
      { property: "og:title", content: "Plan sheets — Minim" },
      {
        property: "og:description",
        content: "Cut list, scaled elevations, cutting layout and printable PDF for your model.",
      },
    ],
  }),
  component: PlanViewer,
});

const FACES: FaceKey[] = ["front", "right", "back", "left"];
const MAX_PHOTOS = 8;

function PlanViewer() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runGenerate = useServerFn(generatePlan);
  const [regenerating, setRegenerating] = useState(false);
  const [uploading, setUploading] = useState(false);


  const { data, isLoading, error } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data: project, error: pErr } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (pErr) throw pErr;
      const { data: plans } = await supabase
        .from("plans")
        .select("id, model, version")
        .eq("project_id", id)
        .order("version", { ascending: false })
        .limit(1);
      const { data: images } = await supabase
        .from("project_images")
        .select("id, storage_path")
        .eq("project_id", id)
        .order("sort_order", { ascending: true });
      const photos = await Promise.all(
        (images ?? []).map(async (img) => {
          const { data: signed } = await supabase.storage
            .from("project-media")
            .createSignedUrl(img.storage_path, 3600);
          return { id: img.id, path: img.storage_path, url: signed?.signedUrl ?? null };
        }),
      );
      return { project, plan: plans?.[0] ?? null, photos };
    },
  });


  const [scale, setScale] = useState<ScaleSettings | null>(null);
  const [model, setModel] = useState<PlanModel | null>(null);

  useEffect(() => {
    if (!data?.project) return;
    const p = data.project;
    setScale({
      mode: p.scale_mode === "target" ? "target" : "ratio",
      denominator: p.scale_denominator ?? 12,
      targetHeightIn: p.target_height_in ?? null,
      stockThicknessIn: p.stock_thickness_in ?? 0.25,
      material: p.material ?? MATERIAL_OPTIONS[0],
    });
  }, [data?.project]);

  useEffect(() => {
    if (data?.plan?.model) setModel(normalizePlanModel(data.plan.model));
  }, [data?.plan]);

  const rows = useMemo(
    () => (model && scale ? buildCutList(model, scale) : []),
    [model, scale],
  );
  const overall = useMemo(
    () => (model && scale ? modelOverall(model, scale) : null),
    [model, scale],
  );

  async function persistScale(next: ScaleSettings) {
    setScale(next);
    await supabase
      .from("projects")
      .update({
        scale_mode: next.mode,
        scale_denominator: next.denominator,
        target_height_in: next.targetHeightIn,
        stock_thickness_in: next.stockThicknessIn,
        material: next.material,
      })
      .eq("id", id);
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      await runGenerate({ data: { projectId: id } });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      toast.success("Plan redrafted from your photos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not regenerate");
    } finally {
      setRegenerating(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files || !data?.project) return;
    const existing = data.photos.length;
    const picks = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, MAX_PHOTOS - existing);
    if (!picks.length) {
      toast.error(`You can keep up to ${MAX_PHOTOS} reference photos.`);
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < picks.length; i++) {
        const file = picks[i]!;
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${data.project.user_id}/${id}/${Date.now()}-${existing + i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("project-media")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        const { error: rowErr } = await supabase.from("project_images").insert({
          project_id: id,
          user_id: data.project.user_id,
          storage_path: path,
          sort_order: existing + i,
        });
        if (rowErr) throw new Error(rowErr.message);
      }
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      toast.success(
        picks.length === 1 ? "Photo added — redraft to use it." : `${picks.length} photos added — redraft to use them.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(photo: { id: string; path: string }) {
    try {
      await supabase.from("project_images").delete().eq("id", photo.id);
      await supabase.storage.from("project-media").remove([photo.path]);
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove photo");
    }
  }



  async function updateOverall(field: "widthIn" | "depthIn" | "heightIn", value: number) {
    if (!model) return;
    const next: PlanModel = {
      ...model,
      overall: {
        ...model.overall,
        [field]: value,
        wallHeightIn:
          field === "heightIn"
            ? Math.min(model.overall.wallHeightIn, value)
            : model.overall.wallHeightIn,
      },
    };
    setModel(next);
    if (data?.plan) {
      await supabase.from("plans").update({ model: next as never }).eq("id", data.plan.id);
    }
  }

  async function removeProject() {
    await supabase.from("projects").delete().eq("id", id);
    toast.success("Project deleted.");
    navigate({ to: "/projects" });
  }

  function downloadPdf() {
    if (!model || !scale) return;
    const doc = buildPlanPdf(model, scale, {
      projectTitle: data?.project.title ?? "Miniature plan",
      sheetWidthIn: 24,
    });
    doc.save(`${(data?.project.title ?? "plan").replace(/[^\w-]+/g, "-").toLowerCase()}-plans.pdf`);
  }

  if (isLoading) {
    return <p className="mx-auto max-w-6xl px-6 py-16 tech-label text-muted-foreground">Loading plan…</p>;
  }
  if (error || !data?.project) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <Button asChild className="mt-4">
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  const photoPanel = (
    <section className="mt-8 rounded-lg border-2 border-foreground bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="tech-label text-blueprint">Reference photos</h2>
        <p className="text-xs text-muted-foreground">
          {data.photos.length} of {MAX_PHOTOS} · all views are read together when drafting
        </p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {data.photos.map((photo, i) => (
          <div
            key={photo.id}
            className="relative aspect-square overflow-hidden rounded border border-border bg-muted"
          >
            {photo.url ? (
              <img
                src={photo.url}
                alt={`Reference photo ${i + 1} of the subject`}
                loading="lazy"
                className="size-full object-cover"
              />
            ) : null}
            <span className="absolute left-1 top-1 rounded bg-foreground/80 px-1 tech-label text-[10px] text-background">
              {i + 1}
            </span>
            <button
              type="button"
              aria-label={`Remove reference photo ${i + 1}`}
              onClick={() => removePhoto(photo)}
              className="absolute right-1 top-1 rounded bg-foreground/80 p-1 text-background"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {data.photos.length < MAX_PHOTOS && (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent">
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <span className="tech-label">add</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Added or removed a view? Hit Redraft so the measurements are recalculated from the full set.
      </p>
    </section>
  );

  if (!model || !scale || !overall) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">No plan drafted yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The AI measurement never finished for this project.
        </p>
        <Button className="mt-6" onClick={regenerate} disabled={regenerating}>
          {regenerating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Draft the plan
        </Button>
      </div>
    );
  }

  const sqft = sheetAreaSqIn(rows) / 144;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/projects" className="tech-label text-blueprint">
            ← All projects
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{data.project.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {model.subject} · {model.style} · {model.stories} storey
            {model.stories === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={regenerate} disabled={regenerating}>
            {regenerating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Redraft
          </Button>
          <Button size="sm" onClick={downloadPdf}>
            <Download className="mr-2 size-4" /> PDF pack
          </Button>
          <Button variant="ghost" size="sm" onClick={removeProject}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Scale controls */}
      <section className="mt-8 rounded-lg border-2 border-foreground bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="tech-label text-blueprint">Scale bench</h2>
          <PlanScaleBadge model={model} scale={scale} />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select
              value={scale.mode}
              onValueChange={(v) => persistScale({ ...scale, mode: v as "ratio" | "target" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ratio">Standard scale</SelectItem>
                <SelectItem value="target">Target height</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scale.mode === "ratio" ? (
            <div className="space-y-1.5">
              <Label>Ratio</Label>
              <Select
                value={String(scale.denominator)}
                onValueChange={(v) => persistScale({ ...scale, denominator: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCALE_PRESETS.map((s) => (
                    <SelectItem key={s.denominator} value={String(s.denominator)}>
                      {s.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="6">1:6</SelectItem>
                  <SelectItem value="87">1:87</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="target">Finished height (in)</Label>
              <Input
                id="target"
                type="number"
                step="0.5"
                value={scale.targetHeightIn ?? ""}
                onChange={(e) =>
                  persistScale({ ...scale, targetHeightIn: Number(e.target.value) || null })
                }
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Stock thickness</Label>
            <Select
              value={String(scale.stockThicknessIn)}
              onValueChange={(v) => persistScale({ ...scale, stockThicknessIn: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THICKNESS_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={String(t.value)}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Material</Label>
            <Select
              value={scale.material}
              onValueChange={(v) => persistScale({ ...scale, material: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
          {(
            [
              ["Real width", "widthIn"],
              ["Real depth", "depthIn"],
              ["Real height", "heightIn"],
            ] as const
          ).map(([label, field]) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={field}>{label} (in)</Label>
              <Input
                id={field}
                type="number"
                step="1"
                value={model.overall[field]}
                onChange={(e) => updateOverall(field, Number(e.target.value) || 0)}
              />
              <p className="font-mono text-[11px] text-muted-foreground">
                {formatFeetInches(model.overall[field])} real → {formatInches(overall[field])} model
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Model summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Model size", `${formatInches(overall.widthIn)} W × ${formatInches(overall.depthIn)} D`],
          ["Model height", formatInches(overall.heightIn)],
          ["Parts to cut", String(rows.reduce((s, r) => s + r.quantity, 0))],
          ["Stock needed", `${sqft.toFixed(1)} sq ft`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-secondary p-4">
            <p className="tech-label text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="cutlist" className="mt-10">
        <TabsList>
          <TabsTrigger value="cutlist">Cut list</TabsTrigger>
          <TabsTrigger value="drawings">Elevations</TabsTrigger>
          <TabsTrigger value="layout">Cutting layout</TabsTrigger>
          <TabsTrigger value="build">Assembly</TabsTrigger>
        </TabsList>

        <TabsContent value="cutlist" className="pt-6">
          <div className="overflow-x-auto rounded-lg border-2 border-foreground">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-secondary">
                <tr>
                  {["Part", "Qty", "Length", "Width", "Thickness", "Notes"].map((h) => (
                    <th key={h} className="tech-label border-b border-border px-4 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-sans font-medium">{r.name}</td>
                    <td className="px-4 py-3">{r.quantity}</td>
                    <td className="px-4 py-3">{formatInches(r.lengthIn)}</td>
                    <td className="px-4 py-3">{formatInches(r.widthIn)}</td>
                    <td className="px-4 py-3">{formatInches(r.thicknessIn)}</td>
                    <td className="px-4 py-3 font-sans text-xs text-muted-foreground">{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="drawings" className="pt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {FACES.map((face) => (
              <div key={face} className="rounded-lg border-2 border-foreground bg-card p-5">
                <p className="tech-label text-blueprint">{face} elevation</p>
                <div className="mt-3">
                  <Elevation model={model} scale={scale} face={face} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="layout" className="pt-6">
          <div className="rounded-lg border-2 border-foreground bg-card p-5">
            <p className="tech-label text-blueprint">Nested on 24&quot; wide stock</p>
            <div className="mt-4 overflow-x-auto">
              <PanelLayout rows={rows} sheetWidthIn={24} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="build" className="space-y-8 pt-6">
          <section>
            <h3 className="text-lg font-bold">Assembly steps</h3>
            <ol className="mt-4 space-y-3">
              {model.assemblySteps.map((step, i) => (
                <li key={i} className="flex gap-4 border-b border-border pb-3 last:border-0">
                  <span className="tech-label text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {model.finishingSteps.length > 0 && (
            <section>
              <h3 className="text-lg font-bold">Finishing</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {model.finishingSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}

          {model.extraMaterials.length > 0 && (
            <section>
              <h3 className="text-lg font-bold">Also gather</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {model.extraMaterials.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-dashed border-border bg-secondary p-5">
            <h3 className="tech-label text-accent">Estimated from photos</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {model.assumptions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Correct any real dimension in the scale bench above and every sheet recomputes.
            </p>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

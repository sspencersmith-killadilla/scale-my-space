import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, ImagePlus, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlanGeneration } from "@/hooks/usePlanGeneration";
import type { DetailLevel } from "@/lib/plan-prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanPreview3D } from "@/components/PlanPreview3D";
import { GlossaryText } from "@/components/GlossaryText";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

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
  ensureMasses,
  isRoundMass,
  massWidth,
  massDepth,
  formatFeetInches,
  formatInches,
  modelOverall,
  normalizePlanModel,
  sheetAreaSqIn,
  stagePartCodes,
  type FaceKey,
  type PlanModel,
  type ScaleSettings,
} from "@/lib/plan-model";

const BEGINNER_PRIMER = [
  "Every part has a label (A1, B2…). Write the label in pencil on each piece as soon as you cut it, or print the sticker page from the PDF.",
  "Measure twice, cut once. Mark with a sharp pencil and cut on the waste side of the line so the piece keeps its full size.",
  "Cut a little long and sand down to the line — you can always remove wood, never add it back.",
  "Dry-fit (assemble without glue) before every glue-up so you find problems while they are easy to fix.",
  "Use a small square or a playing card corner to check every corner is 90° while the glue is wet.",
  "Wood glue needs about 30 minutes clamped and a few hours before it takes stress. Wipe squeeze-out with a damp cloth.",
  "Curved or arched pieces have full-size templates in the PDF: print at 100% (check the 1-inch square), cut out, trace.",
  "Hold small parts with clamps or tape, never your fingers, near a blade.",
];

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({
    meta: [
      { title: "Plan sheets — Shrinkify" },
      {
        name: "description",
        content: "Cut list, scaled elevations, cutting layout and printable PDF for your model.",
      },
      { property: "og:title", content: "Plan sheets — Shrinkify" },
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
  const { generate, stage: aiStage } = usePlanGeneration();
  const [regenerating, setRegenerating] = useState(false);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("standard");
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
      beginner: localStorage.getItem(`shrinkify.beginner.${id}`) !== "off",
    });
  }, [data?.project, id]);

  // Build progress: ticked steps saved on this device.
  const progressKey = `shrinkify.progress.${id}`;
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setDoneSteps(new Set(JSON.parse(localStorage.getItem(progressKey) ?? "[]") as string[]));
    } catch {
      setDoneSteps(new Set());
    }
  }, [progressKey]);
  function toggleStep(key: string) {
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(progressKey, JSON.stringify([...next]));
      return next;
    });
  }

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
  const masses = useMemo(() => (model ? ensureMasses(model) : []), [model]);
  const denominator = overall?.denominator ?? 1;

  async function persistScale(next: ScaleSettings) {
    setScale(next);
    localStorage.setItem(`shrinkify.beginner.${id}`, next.beginner ? "on" : "off");
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
      await generate({ projectId: id, detailLevel });
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
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-bold">No plan drafted yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add every view you have, then draft the plan from the full set.
          </p>
          <Button className="mt-6" onClick={regenerate} disabled={regenerating}>
            {regenerating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Draft the plan
          </Button>
        </div>
        {photoPanel}
      </main>
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
        <div className="flex flex-wrap items-center gap-2">
          <Select value={detailLevel} onValueChange={(v) => setDetailLevel(v as DetailLevel)}>
            <SelectTrigger className="h-9 w-[168px]" aria-label="Shape detail level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="simple">Simple detail</SelectItem>
              <SelectItem value="standard">Standard detail</SelectItem>
              <SelectItem value="museum">Museum detail</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={regenerate} disabled={regenerating}>
            {regenerating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            {regenerating && aiStage ? aiStage : "Redraft"}

          </Button>
          <Button size="sm" onClick={downloadPdf}>
            <Download className="mr-2 size-4" /> PDF pack
          </Button>
          <Button variant="ghost" size="sm" onClick={removeProject}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {photoPanel}





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

        <label className="mt-5 flex items-start gap-3 rounded border border-border bg-secondary p-3">
          <Switch
            checked={scale.beginner ?? true}
            onCheckedChange={(v) => persistScale({ ...scale, beginner: v })}
            aria-label="Beginner mode"
          />
          <span className="text-sm">
            <span className="font-semibold">Beginner mode</span>
            <span className="block text-xs text-muted-foreground">
              Rounds every cut to the nearest 1/16" so you can mark it with an ordinary ruler.
            </span>
          </span>
        </label>

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

      {model.overview && (
        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="tech-label text-blueprint">What you are building</h2>
          <p className="mt-2 text-sm leading-relaxed">{model.overview}</p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {model.difficulty} build
            {model.estimatedHours > 0 ? ` · about ${model.estimatedHours} hours of work` : ""}
          </p>
        </section>
      )}

      <Tabs defaultValue="cutlist" className="mt-10">
        <TabsList className="flex-wrap">
          <TabsTrigger value="cutlist">Cut list</TabsTrigger>
          <TabsTrigger value="preview3d">3D preview</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>


          <TabsTrigger value="drawings">Elevations</TabsTrigger>
          <TabsTrigger value="layout">Cutting layout</TabsTrigger>
          <TabsTrigger value="build">Step-by-step</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="finish">Paint &amp; finish</TabsTrigger>
          <TabsTrigger value="basics">Tools &amp; terms</TabsTrigger>
        </TabsList>

        <TabsContent value="cutlist" className="pt-6">
          <div className="overflow-x-auto rounded-lg border-2 border-foreground">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-secondary">
                <tr>
                  {["Label", "Part", "Qty", "Length", "Width", "Thickness", "Where it goes & how to cut it"].map(
                    (h) => (
                      <th key={h} className="tech-label border-b border-border px-4 py-3 text-left">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3 font-bold text-accent">{r.code}</td>
                    <td className="px-4 py-3 font-sans font-medium">{r.name}</td>
                    <td className="px-4 py-3">{r.quantity}</td>
                    <td className="px-4 py-3">{formatInches(r.lengthIn)}</td>
                    <td className="px-4 py-3">{formatInches(r.widthIn)}</td>
                    <td className="px-4 py-3">{formatInches(r.thicknessIn)}</td>
                    <td className="px-4 py-3 font-sans text-xs text-muted-foreground">
                      {r.location && <p className="text-foreground">{r.location}</p>}
                      {r.cutNotes && <p className="mt-1">{r.cutNotes}</p>}
                      {r.notes && <p className="mt-1">{r.notes}</p>}
                      {r.openings.length > 0 && (
                        <div className="mt-2 rounded border border-dashed border-border p-2">
                          <p className="tech-label text-accent">Cut these openings out</p>
                          <ul className="mt-1 space-y-1 font-mono">
                            {r.openings.map((o, i) => (
                              <li key={i}>
                                {o.label}: {formatInches(o.widthIn)} × {formatInches(o.heightIn)} —{" "}
                                {formatInches(o.fromLeftIn)} from the left edge,{" "}
                                {formatInches(o.fromBottomIn)} up from the bottom
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="preview3d" className="pt-6">
          <PlanPreview3D model={model} scale={scale} thicknessIn={scale.stockThicknessIn} />
          <p className="mt-3 text-xs text-muted-foreground">
            Assembled mock-up generated from the same numbers as the cut list — drag to orbit,
            scroll to zoom. Panel thickness, wall heights, roof pitch and every window and door
            sit exactly where the plans place them.
          </p>
        </TabsContent>

        <TabsContent value="structure" className="space-y-8 pt-6">
          {model.structureNotes && (
            <section className="rounded-lg border-2 border-foreground bg-card p-5">
              <p className="tech-label text-blueprint">What the photos show</p>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {model.structureNotes}
              </p>
            </section>
          )}

          {masses.length > 0 && (
            <section>
              <p className="tech-label text-blueprint">
                Massing — {masses.length} volume{masses.length === 1 ? "" : "s"}
              </p>
              <div className="mt-3 overflow-x-auto rounded-lg border-2 border-foreground">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      {["Volume", "Shape", "Footprint", "Wall height", "Top", "Notes"].map((h) => (
                        <th key={h} className="tech-label border-b border-border px-4 py-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {masses.map((m) => (
                      <tr key={m.id} className="border-b border-border align-top last:border-0">
                        <td className="px-4 py-3 font-sans font-medium">{m.name}</td>
                        <td className="px-4 py-3">{m.kind}</td>
                        <td className="px-4 py-3">
                          {isRoundMass(m)
                            ? `⌀ ${formatInches(massWidth(m) / denominator)}`
                            : `${formatInches(massWidth(m) / denominator)} × ${formatInches(
                                massDepth(m) / denominator,
                              )}`}
                        </td>
                        <td className="px-4 py-3">{formatInches(m.heightIn / denominator)}</td>
                        <td className="px-4 py-3">
                          {m.top.type}
                          {m.top.riseIn > 0
                            ? ` +${formatInches(m.top.riseIn / denominator)}`
                            : ""}
                        </td>
                        <td className="px-4 py-3 font-sans text-xs text-muted-foreground">
                          {[m.materialNote, m.notes, m.top.notes].filter(Boolean).join(" ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Sizes shown are finished model inches at the current scale. Build each volume
                separately, then join them as the step-by-step instructions describe.
              </p>
            </section>
          )}

          {model.features.length > 0 && (
            <section className="space-y-4">
              <p className="tech-label text-blueprint">Architectural features</p>
              <div className="grid gap-4 md:grid-cols-2">
                {model.features.map((f) => (
                  <div key={f.id} className="rounded-lg border-2 border-foreground bg-card p-5">
                    <p className="font-medium">{f.name}</p>
                    <p className="tech-label mt-1 text-muted-foreground">
                      {f.type.replace("-", " ")}
                      {f.count > 1 ? ` · ${f.count} of them` : ""}
                    </p>
                    {f.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
                    )}
                    {(f.widthIn > 0 || f.heightIn > 0) && (
                      <p className="mt-2 font-mono text-xs">
                        {formatInches(f.widthIn / denominator)} ×{" "}
                        {formatInches(f.heightIn / denominator)}
                        {f.projectionIn > 0
                          ? `, standing ${formatInches(f.projectionIn / denominator)} off the wall`
                          : ""}
                      </p>
                    )}
                    {f.howToMake.length > 0 && (
                      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                        {f.howToMake.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {model.knownDifferences.length > 0 && (
            <section className="rounded-lg border-2 border-dashed border-accent bg-card p-5">
              <p className="tech-label text-accent">Where the model simplifies the real thing</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {model.knownDifferences.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </section>
          )}
        </TabsContent>


        <TabsContent value="drawings" className="pt-6">

          <div className="grid gap-6 lg:grid-cols-2">
            {FACES.map((face) => (
              <div key={face} className="rounded-lg border-2 border-foreground bg-card p-5">
                <p className="tech-label text-blueprint">{face} elevation</p>
                <div className="mt-3">
                  <Elevation model={model} scale={scale} face={face} />
                </div>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {model.openings
                    .filter((o) => o.face === face)
                    .map((o, i) => (
                      <li key={i}>
                        <span className="font-medium text-foreground">
                          {o.label || `${o.kind} ${i + 1}`}
                        </span>
                        {o.paneCols && o.paneRows && o.kind === "window"
                          ? ` · ${o.paneCols}×${o.paneRows} panes`
                          : ""}
                        {o.trimNote ? ` · ${o.trimNote}` : ""}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          {model.roof.buildNotes && (
            <div className="mt-6 rounded-lg border border-border bg-secondary p-5">
              <h3 className="tech-label text-blueprint">Roof</h3>
              <p className="mt-2 text-sm">
                {model.roof.type}
                {model.roof.pitchNote ? ` · ${model.roof.pitchNote}` : ""}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{model.roof.buildNotes}</p>
            </div>
          )}
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
          {model.assemblyStages.length > 0 && (() => {
            const total = model.assemblyStages.reduce((n, st) => n + st.steps.length, 0);
            const done = [...doneSteps].length;
            return (
              <p className="tech-label text-blueprint">
                Progress: {Math.min(done, total)} of {total} steps done — tick each step as you finish it.
              </p>
            );
          })()}
          <section className="rounded-lg border-2 border-foreground bg-card p-5">
            <h3 className="tech-label text-accent">New to woodworking? Read this first</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {BEGINNER_PRIMER.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
          {model.safetyNotes.length > 0 && (
            <section className="rounded-lg border border-accent/50 bg-secondary p-5">
              <h3 className="tech-label text-accent">Before you start</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {model.safetyNotes.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}

          {model.assemblyStages.length > 0
            ? model.assemblyStages.map((stage, si) => (
                <section key={si} className="rounded-lg border-2 border-foreground bg-card p-6">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="tech-label text-accent">
                      Stage {String(si + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-lg font-bold">{stage.title}</h3>
                  </div>
                  {stage.goal && <p className="mt-2 text-sm text-muted-foreground">{stage.goal}</p>}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {stage.tools.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="tech-label text-blueprint">Tools </span>
                        {stage.tools.join(", ")}
                      </p>
                    )}
                    {stage.parts.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="tech-label text-blueprint">Parts </span>
                        {stage.parts.join(", ")}
                        {stagePartCodes(stage.parts, rows).length > 0 && (
                          <span className="ml-1 font-mono font-bold text-accent">
                            ({stagePartCodes(stage.parts, rows).join(", ")})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <ol className="mt-5 space-y-5">
                    {stage.steps.map((step, i) => (
                      <li key={i} className="flex gap-4 border-b border-border pb-4 last:border-0">
                        <Checkbox
                          className="mt-0.5"
                          checked={doneSteps.has(`${si}.${i}`)}
                          onCheckedChange={() => toggleStep(`${si}.${i}`)}
                          aria-label={`Mark step ${si + 1}.${i + 1} done`}
                        />
                        <span className="tech-label shrink-0 text-accent">
                          {si + 1}.{i + 1}
                        </span>
                        <div className={doneSteps.has(`${si}.${i}`) ? "opacity-50" : ""}>
                          <p className="text-sm font-medium">
                            <GlossaryText text={step.instruction} glossary={model.glossary} />
                          </p>
                          {step.detail && (
                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                              <GlossaryText text={step.detail} glossary={model.glossary} />
                            </p>
                          )}
                          {step.check && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              <span className="tech-label text-blueprint">Check it </span>
                              {step.check}
                            </p>
                          )}
                          {step.mistake && (
                            <p className="mt-2 border-l-2 border-destructive pl-3 text-xs text-muted-foreground">
                              <span className="font-semibold">Common mistake: </span>
                              {step.mistake}
                            </p>
                          )}
                          {step.tip && (
                            <p className="mt-2 border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                              Tip: {step.tip}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {stage.check && (
                    <p className="mt-4 rounded border border-dashed border-border bg-secondary p-3 text-xs text-muted-foreground">
                      <span className="tech-label text-accent">Check </span>
                      {stage.check}
                    </p>
                  )}
                </section>
              ))
            : model.assemblySteps.length > 0 && (
                <ol className="space-y-3">
                  {model.assemblySteps.map((step, i) => (
                    <li key={i} className="flex gap-4 border-b border-border pb-3 last:border-0">
                      <span className="tech-label text-accent">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm">{step}</span>
                    </li>
                  ))}
                </ol>
              )}

          {model.assemblyStages.length > 0 && model.assemblySteps.length > 0 && (
            <section>
              <h3 className="text-lg font-bold">Quick checklist</h3>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                {model.assemblySteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
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

        <TabsContent value="details" className="space-y-6 pt-6">
          {model.detailElements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No detail pieces were called out. Redraft with a closer photo to capture trim, porches
              and chimneys.
            </p>
          ) : (
            model.detailElements.map((el, i) => (
              <section key={i} className="rounded-lg border-2 border-foreground bg-card p-6">
                <h3 className="text-lg font-bold">{el.name}</h3>
                {el.description && <p className="mt-2 text-sm">{el.description}</p>}
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {el.location && (
                    <p>
                      <span className="tech-label text-blueprint">Where </span>
                      {el.location}
                    </p>
                  )}
                  {el.materials && (
                    <p>
                      <span className="tech-label text-blueprint">Materials </span>
                      {el.materials}
                    </p>
                  )}
                </div>
                {el.howToMake.length > 0 && (
                  <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
                    {el.howToMake.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                )}
              </section>
            ))
          )}
        </TabsContent>

        <TabsContent value="finish" className="space-y-8 pt-6">
          {model.paintPlan.length > 0 && (
            <section className="overflow-x-auto rounded-lg border-2 border-foreground">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-secondary">
                  <tr>
                    {["Area", "Colour", "Paint match", "How to paint it"].map((h) => (
                      <th key={h} className="tech-label border-b border-border px-4 py-3 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.paintPlan.map((p, i) => (
                    <tr key={i} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-3 font-medium">{p.area}</td>
                      <td className="px-4 py-3">{p.color}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.colorMatch}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.technique}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {model.finishingSteps.length > 0 && (
            <section>
              <h3 className="text-lg font-bold">Finishing steps</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                {model.finishingSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}
        </TabsContent>

        <TabsContent value="basics" className="space-y-8 pt-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {(
              [
                ["Tools", model.toolsNeeded],
                ["Supplies", [...model.suppliesNeeded, ...model.extraMaterials]],
              ] as const
            ).map(([label, items]) =>
              items.length ? (
                <section key={label} className="rounded-lg border border-border bg-card p-5">
                  <h3 className="tech-label text-blueprint">{label}</h3>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                    {items.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
          </div>

          {model.glossary.length > 0 && (
            <section>
              <h3 className="text-lg font-bold">Plain-English glossary</h3>
              <dl className="mt-3 space-y-3">
                {model.glossary.map((g, i) => (
                  <div key={i} className="border-b border-border pb-3 last:border-0">
                    <dt className="text-sm font-semibold">{g.term}</dt>
                    <dd className="mt-1 text-sm text-muted-foreground">{g.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </TabsContent>
      </Tabs>

    </main>
  );
}

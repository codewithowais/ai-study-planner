"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AiConnection } from "@/components/ai-connection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ settings: { provider: "claude" | "codex"; model?: string } }>("/api/settings")
      .then((r) => {
        setProvider(r.settings.provider);
        setModel(r.settings.model ?? "");
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function saveModel() {
    setSaving(true);
    try {
      await api.patch("/api/settings", { model: model || "" });
      toast({ title: "Saved" });
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof ApiError ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="AI settings"
        description="Connect your local AI and choose which one powers your tutor. Everything runs through a secure local companion service — no tokens or shell access are exposed to the browser."
      />

      {/* AI connection: companion + per-provider install / sign-in / test + active selector */}
      <div className="mb-6">
        <AiConnection onActiveChange={setProvider} />
      </div>

      {/* Advanced: model override for the active provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Advanced — {provider === "codex" ? "Codex" : "Claude"} model
          </CardTitle>
          <CardDescription>
            Optional. Pin a specific model your active CLI supports, or leave blank for its default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="model">Model override (optional)</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Leave blank to use the provider default"
                />
                <p className="text-xs text-muted-foreground">
                  e.g. a specific model id your CLI supports. Blank uses the default.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
                Uploaded documents are treated as untrusted data — instructions inside them are
                never executed.
              </div>

              <Button onClick={saveModel} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save model
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

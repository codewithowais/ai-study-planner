"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Server,
  Download,
  LogIn,
  RefreshCw,
  Copy,
  TerminalSquare,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/ui/use-toast";

type Provider = "claude" | "codex";

interface ProviderStatus {
  installed: boolean;
  version: string | null;
  label: string;
  package: string;
}
interface Status {
  reachable: boolean;
  runtime?: { node: string | null; npm: string | null };
  providers: { claude: ProviderStatus; codex: ProviderStatus };
  activeProvider: Provider;
}

const ORDER: Provider[] = ["claude", "codex"];

// Copy-paste one-liners to install Node.js (which bundles npm) per OS.
const NODE_SETUP: { os: string; match: RegExp; cmd: string }[] = [
  { os: "Windows", match: /win/i, cmd: "winget install OpenJS.NodeJS.LTS" },
  { os: "macOS", match: /mac|darwin/i, cmd: "brew install node" },
  { os: "Linux", match: /linux/i, cmd: "sudo apt-get install -y nodejs npm" },
];

// Full manual setup commands per provider — a "safe side" fallback if the
// one-click Install ever fails (e.g. permissions, or a bad npm binary).
const MANUAL_SETUP: { name: string; install: string; signin: string; signinNote: string }[] = [
  {
    name: "Claude Code",
    install: "npm install -g @anthropic-ai/claude-code",
    signin: "claude",
    signinNote: "then type /login and sign in with your Claude subscription",
  },
  {
    name: "Codex",
    install: "npm install -g @openai/codex",
    signin: "codex login",
    signinNote: "sign in with your ChatGPT/OpenAI account in the browser",
  },
];

export function AiConnection({
  onChange,
  onActiveChange,
}: {
  onChange?: () => void;
  onActiveChange?: (p: Provider) => void;
} = {}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<Provider | null>(null);
  const [verifying, setVerifying] = useState<Provider | null>(null);
  const [switching, setSwitching] = useState<Provider | null>(null);
  const [authed, setAuthed] = useState<Record<Provider, boolean | null>>({
    claude: null,
    codex: null,
  });
  const [signIn, setSignIn] = useState<{ provider: Provider; command: string; hint: string } | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.get<Status>("/api/ai/status");
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Auto-check the active provider once so students see real status
  // ("Signed in ✓") instead of "Not checked yet" without clicking anything.
  const autoVerified = useRef(false);
  useEffect(() => {
    if (!status || autoVerified.current) return;
    const active = status.activeProvider;
    if (status.reachable && status.providers[active]?.installed && authed[active] === null) {
      autoVerified.current = true;
      verify(active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function verify(provider: Provider) {
    setVerifying(provider);
    setAuthed((a) => ({ ...a, [provider]: null }));
    try {
      const r = await api.post<{ authenticated: boolean; installed: boolean; error?: string }>(
        "/api/ai/verify",
        { provider }
      );
      setAuthed((a) => ({ ...a, [provider]: r.authenticated }));
      onChange?.();
      if (!r.authenticated && r.installed) {
        toast({
          title: "Not signed in",
          description: `Sign in to your ${provider === "codex" ? "Codex" : "Claude"} subscription to use it.`,
          variant: "destructive",
        });
      }
    } catch (err) {
      setAuthed((a) => ({ ...a, [provider]: false }));
      toast({ title: "Check failed", description: err instanceof ApiError ? err.message : undefined, variant: "destructive" });
    } finally {
      setVerifying(null);
    }
  }

  async function install(provider: Provider) {
    setInstalling(provider);
    const name = provider === "codex" ? "Codex" : "Claude";
    try {
      const r = await api.post<{ ok: boolean; installed: boolean; version: string | null; error?: string | null }>(
        "/api/ai/install",
        { provider }
      );
      if (r.ok && r.installed) {
        toast({ title: "Installed", description: `${name} CLI ${r.version ?? ""} is ready. Now sign in.` });
        await loadStatus();
        onChange?.();
      } else if (r.ok && !r.installed) {
        // npm succeeded but the CLI won't launch (e.g. missing native binary for this OS/arch).
        toast({
          title: `${name} installed, but won't run here`,
          description: r.error
            ? `The CLI can't start on this machine: ${r.error.split("\n")[0]}`
            : "The package installed but its command didn't launch. This is usually an OS/architecture issue with the CLI itself.",
          variant: "destructive",
        });
        await loadStatus();
      } else {
        toast({ title: "Install failed", description: "See your terminal / try the manual command.", variant: "destructive" });
      }
    } catch (err) {
      toast({
        title: "Install failed",
        description: err instanceof ApiError ? err.message : "Could not reach the companion.",
        variant: "destructive",
      });
    } finally {
      setInstalling(null);
    }
  }

  async function openSignIn(provider: Provider) {
    try {
      const info = await api.post<{ command: string; hint: string }>("/api/ai/login-info", { provider });
      setSignIn({ provider, ...info });
    } catch (err) {
      toast({ title: "Could not load sign-in steps", description: err instanceof ApiError ? err.message : undefined, variant: "destructive" });
    }
  }

  async function makeActive(provider: Provider) {
    if (status?.activeProvider === provider) return;
    setSwitching(provider);
    try {
      await api.patch("/api/settings", { provider });
      setStatus((s) => (s ? { ...s, activeProvider: provider } : s));
      onActiveChange?.(provider);
      onChange?.();
      toast({ title: `${provider === "codex" ? "Codex" : "Claude"} is now powering your tutor` });
    } catch (err) {
      toast({ title: "Could not switch provider", description: err instanceof ApiError ? err.message : undefined, variant: "destructive" });
    } finally {
      setSwitching(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking AI connection…
        </CardContent>
      </Card>
    );
  }

  const reachable = status?.reachable ?? false;
  // The installer needs npm. If the companion is up but npm is absent, the
  // "Install" buttons would fail — so we guide the student to set up Node first.
  const npmReady = !status?.runtime || status.runtime.npm !== null;

  const copy = (cmd: string) => {
    navigator.clipboard?.writeText(cmd);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <>
      <Card data-tour="ai-connection">
        <CardContent className="space-y-4 p-6">
          {/* Companion service (shared by both providers) */}
          <div className="rounded-lg border border-border p-3">
            <MiniStep
              icon={<Server className="h-4 w-4" />}
              ok={reachable}
              title="Local companion service"
              detail={reachable ? "Running on your machine" : "Start it with `npm run companion`"}
            />
          </div>

          {/* Pre-flight: Node/npm missing — can't install CLIs without it. */}
          {reachable && !npmReady && (
            <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Install Node.js first
              </p>
              <p className="text-sm text-muted-foreground">
                The one-click installer needs <span className="font-medium">npm</span>, which comes
                with Node.js — and it isn&apos;t on this computer yet. Run the command for your system,
                then restart the companion and press Re-check.
              </p>
              <div className="space-y-2">
                {NODE_SETUP.map((s) => (
                  <div key={s.os}>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{s.os}</p>
                    <CommandBox command={s.cmd} copy={copy} />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Or download the installer from{" "}
                  <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                    nodejs.org
                  </a>
                  .
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadStatus}>
                <RefreshCw className="h-3.5 w-3.5" />
                Re-check
              </Button>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Sign in to your AI — pick either one (or both)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ORDER.map((p) => (
                <ProviderCard
                  key={p}
                  provider={p}
                  ps={status!.providers[p]}
                  active={status!.activeProvider === p}
                  reachable={reachable}
                  npmReady={npmReady}
                  authed={authed[p]}
                  installing={installing === p}
                  verifying={verifying === p}
                  switching={switching === p}
                  anchor={p === "claude"}
                  copy={copy}
                  onInstall={() => install(p)}
                  onSignIn={() => openSignIn(p)}
                  onVerify={() => verify(p)}
                  onUse={() => makeActive(p)}
                />
              ))}
            </div>
          </div>

          {installing && (
            <p className="flex items-center gap-2 rounded-md bg-secondary/60 p-2.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Installing the CLI can take up to a minute…
            </p>
          )}

          {/* Safe-side reference: full manual commands for both providers. */}
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium">
              Manual setup commands (copy &amp; paste)
            </summary>
            <div className="space-y-4 border-t border-border p-3">
              <p className="text-xs text-muted-foreground">
                Do it yourself in a terminal — handy if the one-click install fails (e.g. it
                needs admin rights). Run the install line, then the sign-in line, then press
                “Test connection”.
              </p>
              {MANUAL_SETUP.map((m) => (
                <div key={m.name} className="space-y-1.5">
                  <p className="text-xs font-semibold">{m.name}</p>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">1. Install</p>
                    <CommandBox command={m.install} copy={copy} />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">2. Sign in — {m.signinNote}</p>
                    <CommandBox command={m.signin} copy={copy} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                On macOS/Linux, prefix an install with <code className="rounded bg-secondary px-1">sudo</code> if
                you get a permission error.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Sign-in guidance dialog */}
      <Dialog open={!!signIn} onOpenChange={(o) => !o && setSignIn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              Sign in to {signIn?.provider === "codex" ? "Codex" : "Claude"}
            </DialogTitle>
            <DialogDescription>{signIn?.hint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-warning/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              Sign-in uses your provider&apos;s secure browser login. Run this in a terminal,
              approve it in your browser, then re-check.
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 p-3">
              <code className="flex items-center gap-2 text-sm">
                <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                {signIn?.command}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (signIn?.command) navigator.clipboard?.writeText(signIn.command);
                  toast({ title: "Copied" });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSignIn(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  const p = signIn?.provider;
                  setSignIn(null);
                  if (p) verify(p);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                I&apos;ve signed in — re-check
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProviderCard({
  provider,
  ps,
  active,
  reachable,
  npmReady,
  authed,
  installing,
  verifying,
  switching,
  anchor,
  copy,
  onInstall,
  onSignIn,
  onVerify,
  onUse,
}: {
  provider: Provider;
  ps: ProviderStatus;
  active: boolean;
  reachable: boolean;
  npmReady: boolean;
  authed: boolean | null;
  installing: boolean;
  verifying: boolean;
  switching: boolean;
  anchor: boolean;
  copy: (cmd: string) => void;
  onInstall: () => void;
  onSignIn: () => void;
  onVerify: () => void;
  onUse: () => void;
}) {
  void provider;
  const installed = ps.installed;
  const connected = reachable && installed && authed === true;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 transition",
        active ? "border-primary bg-accent/40" : "border-border"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-2.5 w-2.5 rounded-full",
              connected ? "bg-success" : installed ? "bg-warning" : "bg-destructive"
            )}
          />
          <span className="font-semibold">{ps.label}</span>
        </div>
        {active ? (
          <Badge className="gap-1">
            <Sparkles className="h-3 w-3" />
            Active
          </Badge>
        ) : (
          <Button size="sm" variant="outline" onClick={onUse} disabled={switching}>
            {switching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Use this
          </Button>
        )}
      </div>

      {/* Installed */}
      <MiniStep
        icon={<Download className="h-3.5 w-3.5" />}
        ok={installed}
        title="Installed"
        detail={installed ? ps.version ?? "Installed" : ps.package}
        action={
          !installed && reachable ? (
            <Button
              size="sm"
              data-tour={anchor ? "ai-install" : undefined}
              onClick={onInstall}
              disabled={installing || !npmReady}
              title={!npmReady ? "Install Node.js first (see the notice above)" : undefined}
            >
              {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {installing ? "Installing…" : "Install"}
            </Button>
          ) : undefined
        }
      />

      {/* Manual install fallback — for when the one-click needs elevated rights. */}
      {!installed && reachable && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">
            Prefer to install it yourself?
          </summary>
          <p className="mb-1 mt-1.5">Run this in a terminal, then press “Test connection”:</p>
          <CommandBox command={`npm install -g ${ps.package}`} copy={copy} />
        </details>
      )}

      {/* Signed in */}
      <MiniStep
        icon={<LogIn className="h-3.5 w-3.5" />}
        ok={authed === true}
        pending={authed === null}
        title="Signed in"
        detail={
          authed === true
            ? "Authenticated"
            : authed === false
              ? "Not signed in"
              : "Not checked yet"
        }
        action={
          installed && authed !== true ? (
            <Button size="sm" variant="secondary" data-tour={anchor ? "ai-signin" : undefined} onClick={onSignIn}>
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </Button>
          ) : undefined
        }
      />

      <Button
        size="sm"
        variant="outline"
        className="mt-1"
        data-tour={anchor ? "ai-verify" : undefined}
        onClick={onVerify}
        disabled={verifying || !reachable || !installed}
      >
        {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Test connection
      </Button>
    </div>
  );
}

function MiniStep({
  icon,
  ok,
  pending,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode;
  ok: boolean;
  pending?: boolean;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {title}
            {pending ? (
              <span className="text-[10px] text-muted-foreground">(?)</span>
            ) : ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** A monospace command with a one-tap copy button. */
function CommandBox({ command, copy }: { command: string; copy: (cmd: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5">
      <code className="flex min-w-0 items-center gap-2 text-xs">
        <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{command}</span>
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => copy(command)}
        aria-label="Copy command"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

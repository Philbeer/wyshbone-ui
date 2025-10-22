/**
 * LeftRunPanel.tsx
 * Wishbone AI — Left-hand "Runs" panel for AutoGen API calls.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "stopped";

export type RunItem = {
  id: string;
  label: string;
  startedAt: string;
  finishedAt?: string | null;
  status: RunStatus;
  archived?: boolean;
  externalUrl?: string;
};

type Props = {
  runs: RunItem[];
  controlled?: boolean;
  onSelect?: (id: string) => void;
  onStop?: (id: string) => void;
  onArchive?: (id: string, archived: boolean) => void;
  onRetry?: (id: string) => void;
  onDuplicate?: (id: string, newId: string) => void;
  onOpenExternal?: (url: string, id: string) => void;
  heightPx?: number;
};

const fmtTime = (iso: string) => {
  const dt = new Date(iso);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const isToday = (d: Date) => {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
};

const newId = () => `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const SectionHeader: React.FC<
  React.PropsWithChildren<{ count?: number; right?: React.ReactNode }>
> = ({ children, count, right }) => (
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-[13px] font-semibold text-foreground">
      {children}{" "}
      {typeof count === "number" ? (
        <span className="text-muted-foreground">({count})</span>
      ) : null}
    </h3>
    {right}
  </div>
);

const Badge: React.FC<{ status: RunStatus }> = ({ status }) => {
  const map: Record<RunStatus, string> = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    failed: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
    stopped: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  };
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${map[status]}`}>
      {status}
    </span>
  );
};

const KebabMenu: React.FC<{
  onOpen: () => void;
  open: boolean;
}> = ({ onOpen, open }) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onOpen();
    }}
    aria-haspopup="menu"
    aria-expanded={open}
    className="rounded-lg border border-border px-2 py-1 text-[12px] text-foreground hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring"
    title="Actions"
    data-testid="button-run-menu"
  >
    •••
  </button>
);

const Menu: React.FC<{
  anchorRef: React.RefObject<HTMLDivElement>;
  open: boolean;
  onClose: () => void;
  items: { label: string; onClick: () => void }[];
}> = ({ anchorRef, open, onClose, items }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!open) return;
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={menuRef}
      role="menu"
      className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-border bg-card shadow-lg"
      data-testid="menu-run-actions"
    >
      {items.map((it, i) => (
        <button
          key={i}
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            it.onClick();
            onClose();
          }}
          className="block w-full text-left px-3 py-2 text-[13px] hover-elevate"
          data-testid={`menu-item-${i}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
};

const RunRow: React.FC<{
  run: RunItem;
  onSelect: (id: string) => void;
  actions: {
    view: () => void;
    retry: () => void;
    duplicate: () => void;
    stop: () => void;
    archiveToggle: () => void;
  };
}> = ({ run, onSelect, actions }) => {
  const menuAnchor = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 mb-2 cursor-pointer hover-elevate active-elevate-2"
      onClick={() => onSelect(run.id)}
      role="button"
      aria-label={`Select run ${run.label}`}
      data-testid={`run-item-${run.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {run.label}
          </span>
          <Badge status={run.status} />
          {run.archived ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              archived
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-muted-foreground">Sent {fmtTime(run.startedAt)}</div>
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          className="hidden sm:inline-block text-[12px] rounded-lg border border-destructive px-2 py-1 text-destructive hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={actions.stop}
          aria-label="Stop workflow"
          title="Stop workflow"
          data-testid={`button-stop-${run.id}`}
        >
          Stop
        </button>

        <div ref={menuAnchor} className="relative">
          <KebabMenu open={menuOpen} onOpen={() => setMenuOpen((v) => !v)} />
          <Menu
            anchorRef={menuAnchor}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            items={[
              { label: "View in Bubble", onClick: actions.view },
              { label: "Retry", onClick: actions.retry },
              { label: "Duplicate", onClick: actions.duplicate },
              {
                label: run.archived ? "Unarchive" : "Archive",
                onClick: actions.archiveToggle,
              },
              { label: "Stop workflow", onClick: actions.stop },
            ]}
          />
        </div>
      </div>
    </div>
  );
};

const LeftRunPanel: React.FC<Props> = ({
  runs,
  controlled = false,
  onSelect,
  onStop,
  onArchive,
  onRetry,
  onDuplicate,
  onOpenExternal,
  heightPx,
}) => {
  const [showArchived, setShowArchived] = useState(false);
  const [localRuns, setLocalRuns] = useState<RunItem[]>(runs);

  useEffect(() => {
    if (controlled) return;
    setLocalRuns(runs);
  }, [runs.length, controlled]);

  const list = controlled ? runs : localRuns;

  const { todays, previous } = useMemo(() => {
    const t: RunItem[] = [];
    const p: RunItem[] = [];
    for (const r of list) {
      if (r.archived && !showArchived) continue;
      (isToday(new Date(r.startedAt)) ? t : p).push(r);
    }
    const byDateDesc = (a: RunItem, b: RunItem) =>
      +new Date(b.startedAt) - +new Date(a.startedAt);
    t.sort(byDateDesc);
    p.sort(byDateDesc);
    return { todays: t, previous: p };
  }, [list, showArchived]);

  const stickyHeight =
    typeof heightPx === "number"
      ? heightPx
      : typeof window !== "undefined"
      ? Math.max(window.innerHeight - 96, 420)
      : 640;

  const mutate = (fn: (prev: RunItem[]) => RunItem[]) => {
    if (controlled) return;
    setLocalRuns((prev) => fn(prev));
  };

  const _select = (id: string) => {
    onSelect?.(id);
  };

  const _stop = (id: string) => {
    mutate((prev) => prev.map((r) => (r.id === id ? { ...r, status: "stopped" as RunStatus, finishedAt: new Date().toISOString() } : r)));
    onStop?.(id);
  };

  const _archiveToggle = (id: string) => {
    const current = list.find((r) => r.id === id);
    const nextArchived = !current?.archived;
    mutate((prev) => prev.map((r) => (r.id === id ? { ...r, archived: nextArchived } : r)));
    onArchive?.(id, !!nextArchived);
  };

  const _retry = (id: string) => {
    const ref = list.find((r) => r.id === id);
    if (!ref) return;
    const newRun: RunItem = {
      ...ref,
      id: newId(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "queued",
      archived: false,
      label: ref.label.replace(/\s+\(copy.*\)$/i, ""),
    };
    mutate((prev) => [newRun, ...prev]);
    onRetry?.(id);
  };

  const _duplicate = (id: string) => {
    const ref = list.find((r) => r.id === id);
    if (!ref) return;
    const newRun: RunItem = {
      ...ref,
      id: newId(),
      label: `${ref.label} (copy)`,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "queued",
      archived: false,
    };
    mutate((prev) => [newRun, ...prev]);
    onDuplicate?.(id, newRun.id);
  };

  const _openExternal = (id: string) => {
    const ref = list.find((r) => r.id === id);
    if (!ref) return;
    if (ref.externalUrl) {
      onOpenExternal?.(ref.externalUrl, id);
      if (!onOpenExternal) window.open(ref.externalUrl, "_blank", "noopener,noreferrer");
    } else {
      alert("No external link available for this run.");
    }
  };

  const renderSection = (items: RunItem[], title: string) => (
    <div className="mb-4">
      <SectionHeader count={items.length}>{title}</SectionHeader>
      {items.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">No runs.</div>
      ) : (
        items.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            onSelect={_select}
            actions={{
              view: () => _openExternal(run.id),
              retry: () => _retry(run.id),
              duplicate: () => _duplicate(run.id),
              stop: () => _stop(run.id),
              archiveToggle: () => _archiveToggle(run.id),
            }}
          />
        ))
      )}
    </div>
  );

  return (
    <aside aria-label="Wishbone Runs (AutoGen)" className="w-80 flex-shrink-0 p-4">
      <div
        className="sticky top-4 overflow-y-auto rounded-2xl bg-card border border-border p-3"
        style={{ height: stickyHeight }}
        data-testid="left-run-panel"
      >
        <div className="px-1 pb-3">
          <h2 className="text-base font-semibold text-foreground">Runs</h2>
          <p className="text-xs text-muted-foreground mt-1">
            AutoGen API calls you've sent. Click to view. Use Stop to cancel. Menu for more actions.
          </p>
        </div>

        <div className="flex items-center justify-between mb-3">
          <label className="text-[12px] text-foreground flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={showArchived}
              onChange={() => setShowArchived((v) => !v)}
              data-testid="checkbox-show-archived"
            />
            Show archived
          </label>
        </div>

        {renderSection(todays, "Today")}
        {renderSection(previous, "Previous")}

        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[11px] text-muted-foreground">
            Tip: Retry re-queues the same request. Duplicate creates a copy you can edit before sending (if your app supports it).
          </p>
        </div>
      </div>
    </aside>
  );
};

export default LeftRunPanel;

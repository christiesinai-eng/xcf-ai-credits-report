'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const PASSWORD = 'AI';
const SESSION_KEY = 'xcf-ai-credits-auth';

interface AiTask {
  gid: string;
  name: string;
  completed: boolean;
  url: string;
  assignee: string | null;
  project: string | null;
  section: string | null;
  aiTool: string | null;
  aiCredits: string | null;
  creditType: string | null;
}

interface ReportData {
  fetchedAt: string;
  totalTasks: number;
  totalCredits: number;
  toolCounts: Record<string, number>;
  inProgress: AiTask[];
  completed: AiTask[];
}

type Tab = 'overview' | 'inprogress' | 'completed' | 'all';

// ── Styles (matching CPA report exactly) ──────────────────────────────────────

const S = {
  header: {
    background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
    padding: '24px 32px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', flexWrap: 'wrap' as const, gap: 12,
  },
  headerTitle: { fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: -0.5, lineHeight: 1.1 },
  headerDate:  { fontSize: 16, color: 'var(--muted)', marginTop: 6 },
  tabs: {
    display: 'flex', gap: 2, padding: '16px 32px 0',
    background: 'var(--bg2)', borderBottom: '1px solid var(--border)', overflowX: 'auto' as const,
  },
  content: { padding: '28px 32px' },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', color: 'var(--muted)', margin: '28px 0 12px',
  },
  sectionTitleFirst: {
    fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12,
  },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 14, marginBottom: 8 },
  kpi: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px' },
  kpiLabel: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 8 },
  kpiValue: { fontSize: 26, fontWeight: 700, color: '#fff' },
  kpiSub: { fontSize: 12, color: 'var(--muted)', marginTop: 4 },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 20 },
  badge: (color: 'red' | 'yellow' | 'green') => ({
    red:    { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,.18)',  color: '#f87171' },
    yellow: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,.18)', color: '#fbbf24' },
    green:  { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,.18)',  color: '#4ade80' },
  })[color],
  hbarRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' },
  hbarLabel: { width: 160, flexShrink: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  hbarTrack: { flex: 1, background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' },
  hbarValue: { width: 90, flexShrink: 0, fontSize: 12, color: 'var(--muted)', textAlign: 'right' as const },
};

function Tab({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 20px', borderRadius: '10px 10px 0 0', cursor: 'pointer',
        color: active ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 500,
        border: active ? '1px solid var(--border)' : '1px solid transparent',
        borderBottom: 'none', whiteSpace: 'nowrap',
        background: active ? 'var(--bg)' : 'transparent', transition: 'background .15s, color .15s',
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; } }}
    >
      {label}
      {count != null && (
        <span style={{ background: 'rgba(245,158,11,.25)', color: '#fbbf24', borderRadius: 10, padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>
          {count}
        </span>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={S.kpi}>
      <div style={S.kpiLabel}>{label}</div>
      <div style={S.kpiValue}>{value}</div>
      {sub && <div style={S.kpiSub}>{sub}</div>}
    </div>
  );
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={S.hbarRow}>
      <div style={S.hbarLabel}>{label}</div>
      <div style={S.hbarTrack}>
        <div style={{ height: '100%', borderRadius: 4, background: color, width: `${pct}%` }} />
      </div>
      <div style={S.hbarValue}>{value.toLocaleString()}</div>
    </div>
  );
}

function TaskTable({ tasks }: { tasks: AiTask[] }) {
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = tasks.filter((t) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.assignee ?? '').toLowerCase().includes(q) ||
      (t.project ?? '').toLowerCase().includes(q) ||
      (t.aiTool ?? '').toLowerCase().includes(q)
    );
  });

  const cols = ['Task', 'Assignee', 'Project', 'AI Tool', 'Credits', 'Credit Type'];

  function getVal(t: AiTask, col: number): string | number {
    switch (col) {
      case 0: return t.name;
      case 1: return t.assignee ?? '';
      case 2: return t.project ?? '';
      case 3: return t.aiTool ?? '';
      case 4: return parseFloat(t.aiCredits ?? '0') || 0;
      case 5: return t.creditType ?? '';
      default: return '';
    }
  }

  const sorted = sortCol == null ? filtered : [...filtered].sort((a, b) => {
    const av = getVal(a, sortCol), bv = getVal(b, sortCol);
    const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv));
    return sortAsc ? cmp : -cmp;
  });

  function thStyle(i: number): React.CSSProperties {
    return {
      padding: '10px 16px', textAlign: 'left', fontSize: 11,
      textTransform: 'uppercase', letterSpacing: '0.06em', color: sortCol === i ? 'var(--accent)' : 'var(--muted)',
      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    };
  }

  function handleSort(i: number) {
    if (sortCol === i) setSortAsc(!sortAsc);
    else { setSortCol(i); setSortAsc(true); }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search task, person, tool…"
          style={{
            background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '7px 12px', color: 'var(--text)', fontSize: 13, width: 240, outline: 'none',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
        />
      </div>
      <div style={S.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c} style={thStyle(i)} onClick={() => handleSort(i)}>
                  {c} <span style={{ opacity: sortCol === i ? 1 : 0.4, marginLeft: 4, color: sortCol === i ? 'var(--accent)' : undefined }}>
                    {sortCol === i ? (sortAsc ? '↑' : '↓') : '↕'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr
                key={t.gid}
                onMouseEnter={(e) => { Array.from(e.currentTarget.cells).forEach((c) => (c.style.background = 'var(--bg3)')); }}
                onMouseLeave={(e) => { Array.from(e.currentTarget.cells).forEach((c) => (c.style.background = '')); }}
              >
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', maxWidth: 300 }}>
                  <a href={t.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 13, fontWeight: 500, color: '#fff', display: 'block',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#fff')}
                  >{t.name}</a>
                  {t.project && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.project}{t.section ? ` › ${t.section}` : ''}
                  </div>}
                </td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {t.assignee ?? <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', maxWidth: 200 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.project ?? '—'}
                  </div>
                </td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {t.aiTool
                    ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: 'rgba(108,99,255,.2)', color: '#a5b4fc' }}>{t.aiTool}</span>
                    : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13,
                  fontWeight: 600, color: t.aiCredits ? 'var(--accent2)' : 'var(--muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {t.aiCredits ? Number(t.aiCredits).toLocaleString() : '—'}
                </td>
                <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12,
                  color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {t.creditType ?? '—'}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No tasks found.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Password overlay ───────────────────────────────────────────────────────────

function PasswordOverlay({ onAuth }: { onAuth: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function check() {
    if (value === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1');
      onAuth();
    } else {
      setError(true);
      setValue('');
      inputRef.current?.focus();
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f1117', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 14,
        padding: '40px 36px', width: 320, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>XCF AI Credits</div>
        <div style={{ fontSize: 13, color: '#8892b0', marginBottom: 24 }}>Enter the password to view this report</div>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          placeholder="Password"
          style={{ width: '100%', padding: '10px 14px', background: '#0f1117', border: '1px solid #2e3250',
            borderRadius: 8, color: '#fff', fontSize: 15, textAlign: 'center', outline: 'none',
            marginBottom: 12, boxSizing: 'border-box' }}
        />
        <button
          onClick={check}
          style={{ width: '100%', padding: 10, background: '#6c63ff', border: 'none',
            borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          View Report
        </button>
        {error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 10 }}>Incorrect password. Please try again.</div>}
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  // Check session storage on mount
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') setAuthed(true);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch once authed
  useEffect(() => { if (authed) fetchData(); }, [authed, fetchData]);

  const fetchedTime = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const today = new Date().toLocaleDateString('en-NZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Tool bar chart data
  const topTools = data
    ? Object.entries(data.toolCounts).sort((a, b) => b[1] - a[1])
    : [];
  const maxToolCount = topTools[0]?.[1] ?? 1;

  const toolColors = ['#6c63ff', '#00d4aa', '#f59e0b', '#ef4444', '#22c55e', '#a78bfa', '#38bdf8'];

  if (!authed) return <PasswordOverlay onAuth={() => setAuthed(true)} />;

  return (
    <>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>XCF AI Credits &amp; Tools</div>
          <div style={S.headerDate}>{today}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Workspace-wide · all AI fields</div>
          <div style={{ fontSize: 12, color: 'var(--accent2)', marginTop: 4 }}>✔ Live Asana data</div>
          {fetchedTime && <div style={{ fontSize: 12, color: '#4a5270', marginTop: 3 }}>Generated {fetchedTime}</div>}
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        <Tab label="Overview"    active={tab === 'overview'}    onClick={() => setTab('overview')} />
        <Tab label="In Progress" active={tab === 'inprogress'}  onClick={() => setTab('inprogress')} count={data?.inProgress.length} />
        <Tab label="Completed"   active={tab === 'completed'}   onClick={() => setTab('completed')} count={data?.completed.length} />
        <Tab label="All Tasks"   active={tab === 'all'}         onClick={() => setTab('all')} />
      </div>

      {/* Content */}
      <div style={S.content}>

        {/* Loading / error */}
        {loading && (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Fetching from Asana…
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <div style={{ color: 'var(--danger)', marginBottom: 8 }}>Failed to load</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{error}</div>
            <button onClick={fetchData} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer' }}>
              Retry
            </button>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {!loading && data && tab === 'overview' && (
          <>
            <div style={S.sectionTitleFirst}>Summary</div>
            <div style={S.kpiGrid}>
              <Kpi label="Total Tasks" value={String(data.totalTasks)} sub="with AI data" />
              <Kpi label="Total Credits" value={data.totalCredits.toLocaleString()} sub="across all tools" />
              <Kpi label="In Progress" value={String(data.inProgress.length)} sub="active tasks" />
              <Kpi label="Completed" value={String(data.completed.length)} sub="finished tasks" />
              <Kpi label="Tools Used" value={String(topTools.length)} sub="distinct AI tools" />
              {data.totalTasks > 0 && (
                <Kpi
                  label="Avg Credits / Task"
                  value={(data.totalCredits / data.totalTasks).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  sub="per task with credits"
                />
              )}
            </div>

            <div style={S.sectionTitle}>Credits by Tool</div>
            <div style={S.card}>
              <div style={{ padding: '12px 20px' }}>
                {topTools.map(([tool, count], i) => (
                  <HBar key={tool} label={tool} value={count} max={maxToolCount} color={toolColors[i % toolColors.length]} />
                ))}
                {topTools.length === 0 && (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    No tool data yet.
                  </div>
                )}
              </div>
            </div>

            <div style={S.sectionTitle}>Refresh Data</div>
            <button
              onClick={fetchData}
              style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, cursor: 'pointer',
                transition: 'background .15s', fontWeight: 500 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
            >
              ↻ Refresh from Asana
            </button>
          </>
        )}

        {/* ── IN PROGRESS ── */}
        {!loading && data && tab === 'inprogress' && (
          <TaskTable tasks={data.inProgress} />
        )}

        {/* ── COMPLETED ── */}
        {!loading && data && tab === 'completed' && (
          <TaskTable tasks={data.completed} />
        )}

        {/* ── ALL ── */}
        {!loading && data && tab === 'all' && (
          <TaskTable tasks={[...data.inProgress, ...data.completed]} />
        )}
      </div>
    </>
  );
}

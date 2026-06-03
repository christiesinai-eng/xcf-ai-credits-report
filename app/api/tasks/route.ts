import { NextResponse } from 'next/server';

const BASE = 'https://app.asana.com/api/1.0';
const TOKEN = process.env.ASANA_ACCESS_TOKEN;
const WORKSPACE = process.env.ASANA_WORKSPACE_GID;

// Custom field GIDs
const AI_TOOL_GID = '1215403593648539';
const AI_CREDITS_GID = '1213617495561849';
const CREDIT_TYPE_GID = '1215403583807476';

const TASK_FIELDS = [
  'gid',
  'name',
  'completed',
  'assignee',
  'assignee.name',
  'custom_fields',
  'custom_fields.gid',
  'custom_fields.name',
  'custom_fields.type',
  'custom_fields.text_value',
  'custom_fields.number_value',
  'custom_fields.enum_value',
  'custom_fields.enum_value.name',
  'custom_fields.multi_enum_values',
  'custom_fields.multi_enum_values.name',
  'custom_fields.display_value',
  'memberships',
  'memberships.project',
  'memberships.project.name',
  'memberships.section',
  'memberships.section.name',
  'permalink_url',
].join(',');

interface AsanaCustomField {
  gid: string;
  name: string;
  type: string;
  text_value?: string | null;
  number_value?: number | null;
  enum_value?: { gid: string; name: string } | null;
  multi_enum_values?: Array<{ gid: string; name: string }> | null;
  display_value?: string | null;
}

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  custom_fields: AsanaCustomField[];
  assignee: { gid: string; name: string } | null;
  memberships: Array<{
    project: { gid: string; name: string };
    section: { gid: string; name: string } | null;
  }>;
  permalink_url: string;
}

function extractField(task: AsanaTask, gid: string): string | null {
  const f = task.custom_fields?.find((cf) => cf.gid === gid);
  if (!f) return null;
  if (f.enum_value?.name) return f.enum_value.name;
  if (f.multi_enum_values?.length) return f.multi_enum_values.map((e) => e.name).join(', ');
  if (f.text_value != null && f.text_value !== '') return f.text_value;
  if (f.display_value != null && f.display_value !== '') return f.display_value;
  if (f.number_value != null) return String(f.number_value);
  return null;
}

async function fetchPage(url: string): Promise<{ data: AsanaTask[]; next?: string }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 10_000));
    return fetchPage(url);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Asana search error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return { data: json.data ?? [], next: json.next_page?.uri };
}

async function searchByField(fieldGid: string): Promise<AsanaTask[]> {
  const params = new URLSearchParams({
    [`custom_fields.${fieldGid}.is_set`]: 'true',
    opt_fields: TASK_FIELDS,
    limit: '100',
  });

  const results: AsanaTask[] = [];
  let pageUrl: string | undefined = `${BASE}/workspaces/${WORKSPACE}/tasks/search?${params}`;

  while (pageUrl) {
    const page = await fetchPage(pageUrl);
    results.push(...page.data);
    pageUrl = page.next;
  }

  return results;
}

export async function GET() {
  try {
    if (!TOKEN) return NextResponse.json({ error: 'ASANA_ACCESS_TOKEN not set' }, { status: 500 });
    if (!WORKSPACE) return NextResponse.json({ error: 'ASANA_WORKSPACE_GID not set' }, { status: 500 });

    // Search for tasks with any of the 3 AI custom fields populated, in parallel
    const [byTool, byCredits, byCreditType] = await Promise.all([
      searchByField(AI_TOOL_GID),
      searchByField(AI_CREDITS_GID),
      searchByField(CREDIT_TYPE_GID),
    ]);

    // Deduplicate by GID (a task may appear in multiple searches)
    const seen = new Set<string>();
    const allTasks: AsanaTask[] = [];
    for (const task of [...byTool, ...byCredits, ...byCreditType]) {
      if (!seen.has(task.gid)) {
        seen.add(task.gid);
        allTasks.push(task);
      }
    }

    // Shape response
    const shaped = allTasks.map((t) => ({
      gid: t.gid,
      name: t.name,
      completed: t.completed,
      url: t.permalink_url,
      assignee: t.assignee?.name ?? null,
      project: t.memberships?.[0]?.project?.name ?? null,
      section: t.memberships?.[0]?.section?.name ?? null,
      aiTool: extractField(t, AI_TOOL_GID),
      aiCredits: extractField(t, AI_CREDITS_GID),
      creditType: extractField(t, CREDIT_TYPE_GID),
    }));

    const inProgress = shaped.filter((t) => !t.completed);
    const completed = shaped.filter((t) => t.completed);

    const totalCredits = shaped.reduce((sum, t) => {
      const v = parseFloat(t.aiCredits ?? '0');
      return sum + (isNaN(v) ? 0 : v);
    }, 0);

    const toolCounts: Record<string, number> = {};
    shaped.forEach((t) => {
      if (t.aiTool) toolCounts[t.aiTool] = (toolCounts[t.aiTool] ?? 0) + 1;
    });

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      totalTasks: shaped.length,
      totalCredits,
      toolCounts,
      inProgress,
      completed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('AI credits route error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

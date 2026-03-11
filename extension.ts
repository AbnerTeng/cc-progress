import * as vscode from 'vscode';
import { readUsage, AggregatedUsage, TokenUsage } from './usageReader';
import { Plan, PLAN_LIMITS, getWindowLimit, getWeeklyLimit } from './planLimits';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/**
 * Build an ASCII progress bar, e.g.  [████████░░] 78%
 * Uses block chars that render well in VS Code status bar.
 */
function progressBar(used: number, limit: number, width = 8): string {
  if (!isFinite(limit) || limit === 0) return '[--------]';
  const pct    = Math.min(used / limit, 1);
  const filled = Math.round(pct * width);
  const empty  = width - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  const pctStr = Math.round(pct * 100).toString().padStart(3, ' ');
  return `[${bar}] ${pctStr}%`;
}


function cfg<T>(key: string): T {
  return vscode.workspace.getConfiguration('claudeCodeProgress').get<T>(key) as T;
}

// ─── Status bar items ─────────────────────────────────────────────────────────

function buildStatusText(usage: AggregatedUsage, plan: Plan, customWeekly: number): string {
  const winLimit    = getWindowLimit(plan, customWeekly);
  const weekLimit   = getWeeklyLimit(plan, customWeekly);

  const winUsed     = usage.session5h.totalTokens;
  const weekUsed    = usage.weekly.totalTokens;

  const winBar  = progressBar(winUsed, winLimit, 6);
  const weekBar = progressBar(weekUsed, weekLimit, 6);

  return `$(beaker) 5h${winBar}  W${weekBar}`;
}

// ─── Detail webview panel ─────────────────────────────────────────────────────

function showDetailPanel(
  context: vscode.ExtensionContext,
  usage: AggregatedUsage,
  plan: Plan,
  customWeekly: number,
) {
  const panel = vscode.window.createWebviewPanel(
    'claudeUsageDetails',
    'Claude Code Progress',
    vscode.ViewColumn.Beside,
    { enableScripts: false },
  );

  const winLimit  = getWindowLimit(plan, customWeekly);
  const weekLimit = getWeeklyLimit(plan, customWeekly);
  const planLabel = PLAN_LIMITS[plan].label;

  function row(label: string, used: number, limit: number): string {
    const pct    = isFinite(limit) ? Math.min((used / limit) * 100, 100) : 0;
    const colour = pct >= 90 ? '#f44747' : pct >= 70 ? '#ffcc00' : '#4ec9b0';
    const barW   = isFinite(limit) ? pct : 0;

    return `
      <div class="row">
        <div class="label">${label}</div>
        <div class="bar-wrap">
          <div class="bar" style="width:${barW}%;background:${colour}"></div>
        </div>
        <div class="numbers">
          ${formatTokens(used)} / ${isFinite(limit) ? formatTokens(limit) : '∞'}
        </div>
      </div>`;
  }

  const html = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Code Progress</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px 28px;
    max-width: 520px;
  }
  h1 { font-size: 1.1em; margin-bottom: 4px; }
  .subtitle { font-size: 0.82em; opacity: 0.6; margin-bottom: 24px; }
  h2 { font-size: 0.88em; text-transform: uppercase; letter-spacing: .08em;
       opacity: 0.55; margin: 20px 0 10px; }
  .row { margin-bottom: 12px; }
  .label { font-size: 0.88em; margin-bottom: 3px; }
  .bar-wrap {
    height: 8px; border-radius: 4px;
    background: var(--vscode-scrollbarSlider-background);
    overflow: hidden; margin-bottom: 3px;
  }
  .bar { height: 100%; border-radius: 4px; transition: width .3s; }
  .numbers { font-size: 0.8em; opacity: 0.75; }
  .footer { margin-top: 28px; font-size: 0.78em; opacity: 0.45; }
</style>
</head>
<body>
<h1>Claude Code Progress</h1>
<div class="subtitle">Plan: <strong>${planLabel}</strong> &nbsp;·&nbsp; Updated: ${usage.lastUpdated.toLocaleTimeString()}</div>

<h2>⏱ 5-Hour Rolling Window</h2>
${row('Tokens used', usage.session5h.totalTokens, winLimit)}

<h2>📅 Today</h2>
${row('Tokens used', usage.daily.totalTokens, winLimit)}

<h2>📆 This Week (7 days)</h2>
${row('Tokens used', usage.weekly.totalTokens, weekLimit)}

<div class="footer">
  Counts are from ~/.claude/projects/**/*.jsonl &nbsp;·&nbsp;
  Limits are estimates — actual limits depend on Anthropic's current policy.
  Run <code>/usage</code> in Claude Code for the authoritative reset time.
</div>
</body>
</html>`;

  panel.webview.html = html;
}

// ─── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Status bar item — placed on the right, high priority so it's visible
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 500);
  bar.command = 'claudeCodeProgress.showDetails';
  bar.tooltip  = 'Claude Code token usage — click for details';
  bar.show();

  let latestUsage: AggregatedUsage | null = null;

  function refresh() {
    try {
      latestUsage = readUsage();
      const plan         = cfg<Plan>('plan') ?? 'pro';
      const customWeekly = cfg<number>('weeklyTokenLimit') ?? 0;
      bar.text = buildStatusText(latestUsage, plan, customWeekly);
    } catch (err) {
      bar.text = '$(beaker) Claude Usage: error';
      console.error('claudeCodeProgress:', err);
    }
  }

  // Commands
  const showDetailsCmd = vscode.commands.registerCommand('claudeCodeProgress.showDetails', () => {
    if (!latestUsage) { vscode.window.showInformationMessage('Claude Usage: still loading…'); return; }
    const plan         = cfg<Plan>('plan') ?? 'pro';
    const customWeekly = cfg<number>('weeklyTokenLimit') ?? 0;
    showDetailPanel(context, latestUsage, plan, customWeekly);
  });

  const openSettingsCmd = vscode.commands.registerCommand('claudeCodeProgress.openSettings', () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'claudeCodeProgress');
  });

  // Refresh on config change
  const onCfgChange = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('claudeCodeProgress')) refresh();
  });

  // Initial + periodic refresh
  refresh();
  const timer = setInterval(refresh, (cfg<number>('refreshSeconds') ?? 30) * 1000);

  context.subscriptions.push(
    bar,
    showDetailsCmd,
    openSettingsCmd,
    onCfgChange,
    { dispose: () => clearInterval(timer) },
  );
}

export function deactivate() {}

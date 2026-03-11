import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;  // input + output (cache reads are "free" for limit purposes)
}

export interface AggregatedUsage {
  session5h: TokenUsage;   // rolling 5-hour window
  daily: TokenUsage;       // today (midnight-to-now local time)
  weekly: TokenUsage;      // last 7 days rolling
  lastUpdated: Date;
}

// ─── JSONL parser ────────────────────────────────────────────────────────────

interface JournalEntry {
  timestamp?: string;
  message?: {
    role?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 };
}

function addEntry(acc: TokenUsage, entry: JournalEntry): void {
  const u = entry.message?.usage;
  if (!u) return;

  const inp = u.input_tokens ?? 0;
  const out = u.output_tokens ?? 0;
  const cr  = u.cache_read_input_tokens ?? 0;
  const cw  = u.cache_creation_input_tokens ?? 0;

  acc.inputTokens      += inp;
  acc.outputTokens     += out;
  acc.cacheReadTokens  += cr;
  acc.cacheWriteTokens += cw;
  acc.totalTokens      += inp + out;   // cache not counted toward hard limits
}

// ─── Main aggregator ─────────────────────────────────────────────────────────

export function readUsage(): AggregatedUsage {
  const claudeDir   = path.join(os.homedir(), '.claude', 'projects');
  const now         = new Date();
  const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const midnightToday = new Date(now);
  midnightToday.setHours(0, 0, 0, 0);

  const session5h = emptyUsage();
  const daily     = emptyUsage();
  const weekly    = emptyUsage();

  if (!fs.existsSync(claudeDir)) {
    return { session5h, daily, weekly, lastUpdated: now };
  }

  // Walk all project dirs and their *.jsonl files
  for (const projectDir of fs.readdirSync(claudeDir)) {
    const projectPath = path.join(claudeDir, projectDir);
    if (!fs.statSync(projectPath).isDirectory()) continue;

    for (const file of fs.readdirSync(projectPath)) {
      if (!file.endsWith('.jsonl')) continue;

      const filePath = path.join(projectPath, file);

      // Quick file-level filter: skip files not modified in last 7 days
      const fileStat = fs.statSync(filePath);
      if (fileStat.mtime < sevenDaysAgo) continue;

      let content: string;
      try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }

      for (const line of content.split('\n')) {
        if (!line.trim()) continue;

        let entry: JournalEntry;
        try { entry = JSON.parse(line); } catch { continue; }

        // Only process assistant messages (they carry usage stats)
        if (entry.message?.role !== 'assistant') continue;
        if (!entry.message?.usage) continue;

        const ts = entry.timestamp ? new Date(entry.timestamp) : null;
        if (!ts || isNaN(ts.getTime())) continue;

        if (ts >= sevenDaysAgo) {
          addEntry(weekly, entry);
          if (ts >= midnightToday) {
            addEntry(daily, entry);
          }
          if (ts >= fiveHoursAgo) {
            addEntry(session5h, entry);
          }
        }
      }
    }
  }

  return { session5h, daily, weekly, lastUpdated: now };
}

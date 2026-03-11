# Claude Code Progress

A VS Code extension that shows your [Claude Code](https://claude.ai/code) token usage as progress bars in the status bar.

## Features

- **Status bar** — compact live view of your 5-hour window and weekly token usage
- **Detail panel** — click the status bar item to see a breakdown of 5h / daily / weekly usage
- Colour-coded bars (green → yellow → red) based on % used
- Configurable refresh interval and plan type

## Usage

After installing, the status bar will show:

```
⚗ 5h[████░░]  63%  W[██░░░░]  18%
```

Click it to open a detailed usage panel.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `claudeCodeUsage.plan` | `pro` | Your Claude Code plan (`pro`, `max5`, `max20`, `api`) |
| `claudeCodeUsage.weeklyTokenLimit` | `0` | Custom weekly token limit (0 = auto from plan) |
| `claudeCodeUsage.refreshSeconds` | `30` | Refresh interval in seconds |

## How it works

Reads token usage directly from `~/.claude/projects/**/*.jsonl` — the local session logs written by Claude Code. No network requests, no API keys required.

## Token limits (estimates)

| Plan | 5-hour window | Weekly |
|---|---|---|
| Pro | 44k | 440k |
| Max ×5 | 88k | 880k |
| Max ×20 | 220k | 2.2M |
| API | ∞ | ∞ |

> Limits are estimates. Run `/usage` inside Claude Code for the authoritative reset time.

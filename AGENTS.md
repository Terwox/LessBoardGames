<!-- JAMES-CONFIG:OMX:START -->
## OMX / James Config Guidance

- Universal Codex guidance lives in `C:\git\James-LLM-Agent-Config`; consult it for global working agreements before changing shared instructions.
- OMX is installed user-wide from `oh-my-codex@0.20.3` with Codex plugin delivery. Do not run `omx update` without deliberately changing this shared pin; it follows the current stable channel. Load plugin workflows including `$deep-interview`, `$ralplan`, and `$ralph` when the task calls for them. If legacy setup is deliberately used, its skills live in `C:\Users\terwo\.codex\skills`.
- Prefer `pwsh` / `pwsh.exe` for modern PowerShell. `powershell.exe` is legacy Windows PowerShell 5.1 and lacks newer parameters such as `Get-Date -AsUTC`; use `[DateTime]::UtcNow.ToString("o")` if forced to stay on 5.1.
- Keep this repo's OMX runtime state in `C:\git\LessBoardGames\.omx`. Do not write project state into `C:\git\James-LLM-Agent-Config`.
- Treat `.omx/` as local/untracked workflow state unless a human explicitly asks to preserve or commit a specific artifact.
- This repo also has `CLAUDE.md`; in Codex, read it as legacy/project-specific guidance alongside this `AGENTS.md`.
<!-- JAMES-CONFIG:OMX:END -->

# LessBoardGames Agent Instructions

## Local Notes
- Add repo-specific architecture notes, workflow conventions, and verification commands here.

# Notes for Claude

## Commits and pull requests

- Keep the `Co-Authored-By: Claude …` line on commits and the "Generated with Claude Code" footer on pull requests.
- Don't link Claude sessions or project threads. Leave out `Claude-Session:` lines and any `claude.ai/code/session_…` or `claude.ai/code/project/…` URL in commit messages, pull request titles and descriptions, and comments.
- Before your first commit in a fresh clone, run `git config core.hooksPath .githooks`. The `commit-msg` hook there removes `Claude-Session:` lines and session links that slip through.

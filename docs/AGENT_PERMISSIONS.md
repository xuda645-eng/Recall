# Recall Agent Permissions

The user approved project-scoped automatic approval review on 2026-10-31.
This configuration changes the reviewer, not the project's delivery workflow
or the requirement to protect private data and production storage.

## Project Defaults

The same settings are installed in both repository roots:

- `../.codex/config.toml`: local parent-workspace configuration.
- `.codex/config.toml`: application-repository configuration, tracked on GitHub.

These paths are relative to the application repository root. Recall and
Recall-next contain separate `.git` directories, so each has its own config.
No user-global approval/sandbox defaults, command allowlist or custom reviewer
policy is replaced. A narrowly scoped trust entry for the separate Recall-next
repository is added to `~/.codex/config.toml` so its project config can load.
Other projects keep their own settings.

```toml
approval_policy = "on-request"
approvals_reviewer = "auto_review"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true
```

Routine work within the workspace can continue without human approval. Eligible
requests to cross the sandbox boundary go to the independent automatic reviewer.
This is not Full Access, does not guarantee every request will be approved, and
does not exempt destructive operations, private-data disclosure or paid services
from the explicit authorization requirements in `AGENTS.md`.

## Loading And Existing Chats

Project `.codex/` layers load only in trusted projects. Both current repository
roots are trusted explicitly; parent-directory trust alone did not enable the
nested Recall-next repository in the installed Codex version. When opening a
separate checkout, review and trust that checkout before expecting its project
settings to load.

Restart the local Codex client and create a new chat in Recall or Recall-next to
load the defaults. Confirm the effective reviewer is `auto_review` and the
sandbox remains `workspace-write`. The permissions menu can use the built-in
Approve for me preset or Custom (config.toml); effective values matter more than
the label. In the CLI, `/status` and `/debug-config` help inspect active settings.

Existing chats can retain explicit permission selections. Check those chats
separately rather than assuming the config has retroactively changed them.
Managed organization requirements and explicit higher-priority overrides can
restrict or replace defaults. This setup is for local execution, not a claim
about unrelated cloud chats, connector permissions or physical-device tests.

## Restore Manual Review

For a temporary change, select Ask for approval in the current chat. To restore
manual review as this project's default, change `approvals_reviewer` to `user`
in both files, restart the client and verify the active settings. Keep
`workspace-write`; no database reset, app redeploy or Git history rewrite is
needed. Record a later policy change as another task under `RELEASES.md`.

## Official References

- [Project configuration and precedence](https://learn.chatgpt.com/docs/config-file/config-advanced)
- [Automatic approval review](https://learn.chatgpt.com/docs/sandboxing/auto-review)

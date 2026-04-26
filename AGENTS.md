<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Sub-Dokumentation

Jeder Ordner hat eine eigene CLAUDE.md als Single Source of Truth. Vor Änderungen immer das zugehörige Dok lesen.

| Bereich | Dok |
|---------|-----|
| Convex Backend | [convex/CLAUDE.md](convex/CLAUDE.md) |
| Canvas-Engine | [components/canvas/CLAUDE.md](components/canvas/CLAUDE.md) |
| Design System (ShadCN) | [components/ui/CLAUDE.md](components/ui/CLAUDE.md) |
| Billing & Credits UI | [components/billing/CLAUDE.md](components/billing/CLAUDE.md) |
| Dashboard | [components/dashboard/CLAUDE.md](components/dashboard/CLAUDE.md) |
| Next.js Routing | [app/CLAUDE.md](app/CLAUDE.md) |
| Utilities & Shared Logic | [lib/CLAUDE.md](lib/CLAUDE.md) |
| Custom Hooks | [hooks/CLAUDE.md](hooks/CLAUDE.md) |
| Agents (Specs & Prompts) | [components/agents/CLAUDE.md](components/agents/CLAUDE.md) |

<!-- BACKLOG.MD MCP GUIDELINES START -->

<CRITICAL_INSTRUCTION>

## BACKLOG WORKFLOW INSTRUCTIONS

This project uses Backlog.md MCP for all task and project management activities.

**CRITICAL GUIDANCE**

- If your client supports MCP resources, read `backlog://workflow/overview` to understand when and how to use Backlog for this project.
- If your client only supports tools or the above request fails, call `backlog.get_backlog_instructions()` to load the tool-oriented overview. Use the `instruction` selector when you need `task-creation`, `task-execution`, or `task-finalization`.

- **First time working here?** Read the overview resource IMMEDIATELY to learn the workflow
- **Already familiar?** You should have the overview cached ("## Backlog.md Overview (MCP)")
- **When to read it**: BEFORE creating tasks, or when you're unsure whether to track work

These guides cover:
- Decision framework for when to create tasks
- Search-first workflow to avoid duplicates
- Links to detailed guides for task creation, execution, and finalization
- MCP tools reference

You MUST read the overview resource to understand the complete workflow. The information is NOT summarized here.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD MCP GUIDELINES END -->

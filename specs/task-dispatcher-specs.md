# Task Dispatcher — Spec
**Date:** 2026-03-22
**Status:** Draft v5

---

## 1. Vision

Tasks are created in the system (by users or automatically) but agents don't know about them unless notified. Without proactive delivery, agents are passive — they only act when a user sends a message.

The task dispatcher makes agents always-on. Every 2 minutes it builds a full work summary for each active agent — their assigned tasks plus any unacknowledged @mentions from other agents — and delivers it in a single prompt via the OpenClaw gateway webhook. Agents wake up, work through everything pending, and tag other agents when they need something done.

**Goal: every agent knows exactly what they need to do, updated every 2 minutes, with no manual intervention.**

---

## 2. Core Concepts

### Dispatcher

A long-running Node.js service deployed as a K8s Deployment in the `clair` namespace. Runs a `setInterval` loop every 2 minutes. Responsible for querying pending tasks, routing them to the correct org gateway, and tracking dispatch state.

The dispatcher is stateless itself — all state lives in the task DB and the org registry.

### Agent Mention

When an agent writes a task entry and tags another agent (e.g. `@maya pull TACoS data for last 7 days`), the backend parses the @mention and creates a `notifications` row for `maya` on that task. The dispatcher collects all undelivered notifications for an agent and includes them in the next dispatch prompt. A notification is marked delivered when the dispatcher sends it — one prompt, one delivery.

### Agent Work Bundle

What the dispatcher sends to each agent per cycle — a single prompt containing:
1. **Assigned tasks** — tasks where this agent is the designated owner (`agent_id`), status `open` or `in_progress`
2. **Mentions** — unacknowledged `@mentions` of this agent across any task

If both lists are empty for an agent, they are skipped that cycle.

### Task Notes (Agent Working Memory)

Each agent maintains a private notes record per task. Since every `/hooks/agent` call is a fresh session with no memory of prior turns, `task_notes` acts as persistent working memory — the agent reads their notes at the start of each turn to reconstruct context, and overwrites them at the end with updated state.

One row per `(task_id, agent_id)`. Updated in-place by the agent via the crew plugin.

### Clair as Coordinator

Clair is the default entry point for new tasks. When a task is created with no `agent_id`, the dispatcher sends it to clair. Clair analyses the task, starts work, and tags specialist agents as needed. Clair also acts as a watchdog — if a task has been `in_progress` with no new activity for too long, clair is dispatched to follow up.

### Org Registry

A mapping from `org_id` → org config (gateway URL + hooks token). This tells the dispatcher where to send each task. Stored in the `org_claw` table in Postgres — queried at the start of each dispatch cycle.

One org = one OpenClaw StatefulSet. One account = one org.

---

## 3. How It Works

### Dispatch loop (every 2 min)

One prompt per agent per cycle, containing all their pending work.

```
1. Fetch active orgs from `org_claw` table (org_id, gateway_url, hooks_token)

2. For each org:
   For each agentId in org.agents:  ← agents list queried from tasks (distinct agent_ids with pending work)

   a. Fetch assigned tasks + notes:
      SELECT t.*, tn.content as notes
      FROM tasks t
      LEFT JOIN task_notes tn ON tn.task_id = t.id AND tn.agent_id = <agentId>
      WHERE t.org_id = <org.orgId>
        AND t.agent_id = <agentId>
        AND t.status IN ('open', 'in_progress')
      ORDER BY priority_rank ASC, created_at ASC

   b. Fetch undelivered notifications:
      SELECT n.*, te.content, t.title, t.id as task_id
      FROM notifications n
      JOIN task_entries te ON te.id = n.entry_id
      JOIN tasks t ON t.id = n.task_id
      WHERE n.agent_id = <agentId>
        AND n.delivered = false
        AND n.org_id = <org.orgId>

   c. If no assigned tasks AND no notifications → skip this agent

   d. Build prompt (see below)

   e. POST /hooks/agent:
      { message: <prompt>, agentId: <agentId> }

   f. On success:
      - UPDATE notifications SET delivered = true WHERE id IN (<fetched ids>)
      - No change to tasks (agent updates their own status via crew plugin)
   g. On failure → log error, skip (retries next cycle)

3. Sleep 2 minutes, repeat
```

### Hook payload

```
You have pending work:

## Assigned Tasks

1. [urgent] Investigate TACoS spike
   Type: analysis | Status: in_progress
   Context: <context_json>
   Your notes: "Pulled spend data last turn. TACoS up 4.8pts driven by 3 campaigns.
                Waiting for leo's bid recommendations before synthesising."

2. [medium] Weekly campaign review
   Type: review | Status: open
   Context: <context_json>
   Your notes: (none yet)

## Mentions

- "Investigate TACoS spike" — leo tagged you:
  "clair I've finished the bid analysis, recommendations are ready for review"

- "Weekly campaign review" — clair tagged you:
  "maya please get total spend by portfolio this week"

Work through each item. Use your tools to complete the work, write your findings
as task activity, update your notes, and @mention other agents if you need something.
```

No channel delivery — agent runs the turn and response is held in the gateway UI.

### OpenClaw hooks config

Hooks must be enabled in each org's OpenClaw instance. The `entrypoint.sh` patches `openclaw.json` on every boot to inject the hooks config:

```json
{
  "hooks": {
    "enabled": true,
    "token": "<OPENCLAW_HOOKS_TOKEN from K8s secret>",
    "allowedAgentIds": ["clair", "main"]
  }
}
```

The hooks token is shared across all orgs (same K8s secret) and is separate from the gateway bearer token.

---

## 4. A Scenario

1. User creates task: "Investigate TACoS spike" — `priority: high`, no `agent_id` (unowned).
2. Dispatcher runs. Clair is the default for unowned tasks → builds prompt with the task, POSTs to clair.
3. Clair analyses the task, writes a task entry: `"@maya pull TACoS data by campaign for last 7 days. @leo once maya has data, recommend bid changes."` → backend parses mentions, creates two `notifications` rows (maya, leo).
4. Next cycle: dispatcher fetches maya's bundle — no assigned tasks, but one mention from clair. Builds prompt including the mention, POSTs to maya.
5. Dispatcher also checks leo — one mention from clair. Builds leo's prompt with the mention. POSTs to leo.
6. Both run concurrently. Dispatcher marks both mentions as acknowledged.
7. Maya fetches data, writes a task entry with findings, tags: `"@leo here's the data"` → new mention for leo.
8. Leo writes bid recommendations as task entries and recommendations. Tags: `"@clair done, please review"` → mention for clair.
9. Next cycle: clair gets a bundle — the mention from leo. Clair reviews, synthesises, marks task `done`.
10. Next cycle: no pending tasks or mentions for any agent → all skipped.

---

## 5. Scope

### MVP (Build Now)

| Feature | Why |
|---------|-----|
| Dispatch loop every 2 min | Core — agents need to wake up |
| `notifications` table | Tracks @mentions; backend-populated, drives dispatch for tagged agents |
| `task_notes` table | Agent working memory — survives across fresh sessions |
| Bundle all pending work per agent | Agent sees full picture — tasks + mentions + notes — in one turn |
| `org_claw` table in Postgres | Org routing lives in DB — no config files, easy to add/disable orgs |
| `POST /hooks/agent` with task context | Full agent execution + channel delivery |
| Hooks config in `entrypoint.sh` | Auto-provisions on pod restart |
| Dispatcher as K8s Deployment | Long-running, restarts on crash |
| Error logging per org | Visibility into dispatch failures |

### Later

| Feature | Why it can wait |
|---------|----------------|
| Per-task dispatch log / history | Useful for debugging but not blocking |
| Org management UI | Direct DB edits are fine for now |
| Backoff on repeated failures | Not critical for v1 with small org count |
| Dispatch status in task UI | UI enhancement, not blocking agent work |
| Agent selection per task type | All tasks go to `clair` for now |

### Out of Scope

- Agent-to-agent task handoff (multi-agent coordination on one task)
- Real-time push (WebSocket/SSE from DB to dispatcher) — polling is fine
- Channel delivery (Telegram, Slack, etc.) — out of scope for now, responses stay in gateway UI

---

## 6. Data Model

### Changes to `tasks` (from task-system.md)

```
agent_id     text   nullable   designated owner agent; null = clair handles by default
```

Full updated `tasks` schema:

```
id           text     PK
org_id       text     FK → orgs.id
agent_id     text     nullable — designated agent; null means clair picks it up
title        text
type         text     enum: analysis | recommendation | review | ...
status       text     enum: open | in_progress | waiting | review | done
priority     text     enum: low | medium | high | urgent
context_json text     JSON — task-specific context for the agent prompt
summary      text     nullable — running summary updated by agent
created_at   text     ISO timestamp
updated_at   text     ISO timestamp
```

Note: `last_dispatched_at` removed — no longer needed. Dispatch is driven by mention acknowledgment, not task-level cooldowns.

### New: `task_notes` table

Agent working memory. One row per `(task_id, agent_id)`. Read by the dispatcher and included in the prompt. Written/overwritten by the agent via the crew plugin at the end of each turn.

```
id           text     PK
task_id      text     FK → tasks.id
agent_id     text     which agent these notes belong to (e.g. "clair", "maya")
content      text     free-form notes — what the agent knows, what it's waiting for, next steps
updated_at   text     ISO timestamp
```

### New: `notifications` table

Tracks @mentions of agents in task entries. Created by the backend when a task entry is saved and @mentions are parsed from the content — agents never write to this table directly. Drives dispatch for the mentioned agent.

```
id             text     PK
org_id         text     FK → orgs.id
task_id        text     FK → tasks.id
entry_id       text     FK → task_entries.id — the entry containing the mention
agent_id       text     the agent who was tagged (e.g. "maya")
delivered      boolean  false until dispatcher sends it; true after dispatch
created_at     text     ISO timestamp
```

### `org_claw` table

Stores which orgs have OpenClaw set up. Queried by the dispatcher at the start of each cycle to get the list of active orgs and their gateway config.

```
id               text      PK   e.g. "acme", "nisha"
org_id           text      FK → orgs.id
gateway_url      text           e.g. "http://openclaw-org-acme:18789"
hooks_token      text           shared secret for /hooks/agent auth
active           boolean        if false, dispatcher skips this org
created_at       timestamptz
updated_at       timestamptz
```

`hooks_token` is stored in Postgres (already behind a VPC, not public). No K8s Secret needed for per-org tokens — only the DB connection string needs to be in a Secret.

All orgs share the same agent set (`clair`, `maya`, `leo`, `luca`). The dispatcher defines this as a constant — no per-org agent configuration needed. Each cycle, all 4 agents are checked for each org and skipped if they have nothing pending.

---

## 7. Architecture

```
                         ┌──────────────────────────────────┐
                         │           Postgres               │
                         │  org_claw, tasks, task_entries,  │
                         │  recommendations, executions     │
                         └──────────────────────────────────┘
                                        ▲
                         SELECT org_claw │   UPDATE notifications
                         SELECT tasks   │
                                        │
┌─────────────────────────────── clair namespace ────────────────────────────────────┐
│                                                                                     │
│   ┌──────────────────────┐                                                          │
│   │   dispatcher pod      │                                                         │
│   │   (Node.js/TS)        │                                                         │
│   │                       │                                                         │
│   │   every 2 min:        │                                                         │
│   │   1. SELECT active    │                                                         │
│   │      org_claw from DB  │                                                         │
│   │   2. for each org,    │                                                         │
│   │      for each agent:  │                                                         │
│   │      pick top task    │                                                         │
│   │      → POST /hooks    │                                                         │
│   └──────────────────────┘                                                          │
│            │                                                                        │
│            │  POST /hooks/agent  (cluster-internal DNS)                             │
│            │                                                                        │
│            ├─────────────────────────────────────┐                                  │
│            │                                     │                                  │
│            ▼                                     ▼                                  │
│   ┌─────────────────────┐          ┌─────────────────────┐                          │
│   │  openclaw-org-acme  │          │  openclaw-org-nisha  │       (more orgs...)    │
│   │  :18789             │          │  :18789              │                         │
│   │  agents: clair,     │          │  agents: clair,      │                         │
│   │    luca, maya, leo  │          │    luca, maya, leo   │                         │
│   └─────────────────────┘          └─────────────────────┘                          │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Cluster-internal DNS:**

Each org has a headless K8s Service (`clusterIP: None`) named `openclaw-org-<id>` in the `clair` namespace. Because the dispatcher pod is in the same namespace, Kubernetes injects `clair.svc.cluster.local` as a DNS search domain — so the short name resolves directly to the pod IP without a virtual IP or load balancer in between:

```
http://openclaw-org-nisha:18789
# resolves to → pod IP (e.g. 10.0.4.233) directly
# full form:  openclaw-org-nisha.clair.svc.cluster.local:18789
```

The `gateway_url` in the `org_claw` table uses the short-form cluster DNS. All traffic stays inside the cluster.

**Data flow:**
- Each cycle: dispatcher queries `org_claw` for active orgs (org_id, gateway URL, hooks token)
- For each org: derives active agents from pending tasks/notifications, queries and bundles per agent, POSTs to `/hooks/agent`
- Dispatcher only writes `last_dispatched_at` — all other task content is written by the agent via the crew plugin
- No ConfigMap or K8s Secret needed for org routing — everything is in Postgres

**Separation of concerns:**

| Layer | Responsibility |
|-------|---------------|
| Dispatcher | Polling, routing, dispatch tracking |
| OpenClaw gateway | Agent execution |
| Postgres | Source of truth for tasks, orgs, activity |
| Crew plugin (in agent) | Agent writes task updates, activity, recommendations back to DB |

**Security:**
- `hooks_token` stored in Postgres, behind VPC — not exposed publicly
- Only the DB connection string is a K8s Secret (single secret, not per-org)
- All dispatcher → gateway traffic is cluster-internal (no TLS needed)

---

## 8. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Language | TypeScript | Matches existing codebase |
| Runtime | Node.js 22 | Matches OpenClaw pods |
| Scheduling | `setInterval` (not K8s CronJob) | Long-running; easier restart/log management |
| HTTP client | `fetch` (native Node 22) | No extra dependency |
| DB client | Same as `@crew/db` (Drizzle + better-sqlite3 or pg) | Reuse existing schema/types |
| Container | Same base image as other Node services | Consistency |
| K8s object | `Deployment` (replicas: 1) | Restarts on crash; single instance avoids double-dispatch |

---

## 9. Implementation Tasks

### Phase 1 — OpenClaw hooks config

- [ ] Add `OPENCLAW_HOOKS_TOKEN` to `infra/clair-platform/openclaw/.env`
- [ ] Update `entrypoint.sh` to patch `openclaw.json` with `hooks.enabled`, `hooks.token`, `hooks.allowedAgentIds`
- [ ] Build and push new image (e.g. v8)
- [ ] `deploy-all --tag v8` to roll out hooks config to all orgs
- [ ] Verify: `curl -X POST http://localhost:18789/hooks/agent -H "Authorization: Bearer <token>" -d '{"message":"ping","agentId":"clair","deliver":false}'` **(DO NOT ATTEMPT — manual verification)**

### Phase 2 — DB migration

- [ ] Create `org_claw` table (`id`, `org_id`, `gateway_url`, `hooks_token`, `active`, `created_at`, `updated_at`)
- [ ] Create `notifications` table (`id`, `org_id`, `task_id`, `entry_id`, `agent_id`, `delivered`, `created_at`)
- [ ] Create `task_notes` table (`id`, `task_id`, `agent_id`, `content`, `updated_at`)
- [ ] Add `agent_id` (nullable) to `tasks` table
- [ ] Run migration

### Phase 3 — OpenClaw extension ✅

- [x] Write `clair-platform/openclaw/extensions/openclaw.plugin.json` — manifest: `crew-tasks` plugin, `CREW_API_URL` + `CREW_API_KEY` config
- [x] Write `clair-platform/openclaw/extensions/index.ts` — 5 tools: `crew_task_list`, `crew_task_update`, `crew_task_entry_add`, `crew_task_notes_update`, `crew_action_create`
- [x] Write `clair-platform/openclaw/extensions/skills/clair-tasks/SKILL.md` — turn flow instructions injected into agent context
- [x] Update `clair-platform/openclaw/templates/shared/OPERATING.md` — fix tool names to match implementation

### Phase 4 — Dispatcher service ✅

- [x] Write `clair-platform/dispatcher/src/index.ts` — startup + `setInterval(runCycle, 2min)`
- [x] Write `clair-platform/dispatcher/src/db.ts` — pg Pool from `DATABASE_URL`
- [x] Write `clair-platform/dispatcher/src/registry.ts` — queries `org_claw` for active orgs
- [x] Write `clair-platform/dispatcher/src/dispatch.ts` — derives active agents, fetches tasks+notes+notifications, POSTs to `/hooks/agent`, marks notifications delivered
- [x] Write `clair-platform/dispatcher/src/prompt.ts` — builds bundle prompt, prepends `OPERATING.md`
- [x] Write `clair-platform/dispatcher/Dockerfile`
- [x] Write `clair-platform/dispatcher/package.json`
- [x] Write `clair-platform/dispatcher/tsconfig.json`
- [x] Write `clair-platform/dispatcher/build.sh` — copies `OPERATING.md` from templates before docker build

### Phase 5 — K8s manifests ✅

- [x] Write `infra/clair-platform/dispatcher/k8s/secret.yaml` — `DATABASE_URL` only
- [x] Write `infra/clair-platform/dispatcher/k8s/deployment.yaml` — single replica, mounts Secret
- [ ] Fill in image tag in `k8s/deployment.yaml` and base64 encode `DATABASE_URL` in `k8s/secret.yaml`
- [ ] Add `org_claw` rows to Postgres for each active org **(manual)**
- [ ] Add dispatcher build + push step to CI or a `dispatcher.sh` deploy script

### Phase 6 — Verification **(DO NOT ATTEMPT)**

- [ ] Create a test task in DB for an org
- [ ] Wait 2 min, confirm dispatcher log shows cycle and agent response
- [ ] Confirm notification is marked `delivered = true` in DB after dispatch
- [ ] Confirm task is included again next cycle if still `in_progress`

---

## 10. Decisions Made

| Question | Decision | Reason |
|----------|----------|--------|
| CronJob vs long-running Deployment | Deployment with setInterval | Simpler log tailing, instant restart on crash, no CronJob scheduling overhead |
| Org registry in DB vs ConfigMap | Postgres `org_claw` table | Easier to add/disable orgs without redeploying; hooks_token already sensitive data in DB |
| One dispatcher vs one per org | One centralized dispatcher | Single codebase, single place to update routing logic |
| Which OpenClaw API to use | `POST /hooks/agent` | Full agent turn + channel delivery in one call; `/hooks/wake` is too lightweight |
| Channel delivery | None in v1 | No messaging channels configured yet — responses held in gateway UI |
| Retry on failure | No backoff in v1 | Natural retry every 2 min is sufficient for small org count |
| Agent selection | Always `clair` | Single agent handles all PPC tasks in v1; agentId is configurable per org in registry |
| Tasks per cycle per agent | All pending (not one) | Agent gets full picture — assigned tasks + all unacknowledged mentions — in one turn |
| Dispatch granularity | Per agent, not per org | Each agent is independent — all agents in an org can run concurrently |
| agent_id on task | Nullable | Tasks are team-owned by default; agent_id only set when there's a clear designated owner |
| Coordination model | Mention-driven, not sub-tasks | Agents tag each other in task entries; no separate sub-task objects needed |
| Agent working memory | `task_notes` table, not session memory | Each `/hooks/agent` call is a fresh session; notes persist the agent's state across turns |
| Notes update | Agent writes via crew plugin | Dispatcher reads notes but never writes them; agent owns their own notes |
| Clair as default | Unowned tasks go to clair | Clair starts the work and delegates via @mentions; also acts as watchdog |
| Mention delivery tracking | `delivered` flag on `notifications` | Matches crew.md pattern; backend creates rows, dispatcher marks delivered |
| Priority ordering | urgent > high > medium > low, then created_at ASC | Urgent work surfaces first in the bundle prompt |

---

## 10A. Test21 Implementation Tracker

This workspace is a reduced Node.js harness used to implement the dispatcher spec in small, testable slices.

- [x] Add a prompt builder module that renders assigned tasks, notes, and mentions into the dispatcher message and applies the agreed priority ordering.
- [x] Add agent bundling helpers for default clair routing and active-agent derivation.
- [ ] Add delivery-planning helpers for successful notification acknowledgement after dispatch.

---

## 11. OpenClaw Extension Spec - `crew-tasks`

The `crew-tasks` extension is an OpenClaw plugin installed in every org's pod at `~/.openclaw/extensions/clair/`. It gives agents the tools they need to read their tasks, write activity, update their working memory, and propose actions — all in a single HTTP hop to the crew backend.

### Plugin structure

```
~/.openclaw/extensions/clair/
├── openclaw.plugin.json        ← plugin manifest
├── index.ts                    ← tool implementations
└── skills/
    └── clair-tasks/
        └── SKILL.md            ← injected into agent context; explains all tools
```

### Plugin manifest (`openclaw.plugin.json`)

```json
{
  "id": "crew-tasks",
  "configSchema": {
    "CREW_API_URL": {
      "type": "string",
      "description": "Base URL of the crew backend API",
      "required": true
    }
  },
  "tools": [
    { "name": "crew_task_list" },
    { "name": "crew_task_update" },
    { "name": "crew_task_entry_add" },
    { "name": "crew_task_notes_update" },
    { "name": "crew_action_create" }
  ]
}
```

`CREW_API_URL` is set once per pod in the OpenClaw env (e.g. `https://api.internal/api`). The plugin reads it via `api.config.CREW_API_URL`. The `agentId` is read from `api.agentId` — injected by OpenClaw from the dispatch payload, never passed by the agent explicitly.

### Tools

#### `crew_task_list`

Lists this agent's active tasks. Called at the start of every turn to build a current view of assigned work.

```
API:    GET /api/tasks?agentId=<api.agentId>&status=open,in_progress
Auth:   Bearer <api.config.CREW_API_KEY>
```

Parameters:
```
status   string   optional   comma-separated status filter (default: "open,in_progress")
```

Returns: array of task objects with `id`, `title`, `status`, `priority`, `context_json`, `summary`, `agent_id`, `created_at`.

---

#### `crew_task_update`

Updates a task's status or summary. Used to move tasks through the lifecycle (`open → in_progress → done`) and to write a human-readable summary of what was done.

```
API:    PATCH /api/tasks/:id
Auth:   Bearer <api.config.CREW_API_KEY>
```

Parameters:
```
task_id   string   required   ID of the task to update
status    string   optional   new status: open | in_progress | waiting | review | done
summary   string   optional   running summary of work done so far
```

---

#### `crew_task_entry_add`

Writes an activity entry on a task. This is the primary way agents communicate — findings, next steps, handoffs. Any `@agentname` mention in `content` is automatically parsed by the backend: a `notifications` row is created for that agent, and the dispatcher will deliver it on the next cycle. The agent does not need to do anything extra to notify another agent — just write the @mention in the entry.

```
API:    POST /api/tasks/:id/entries
Auth:   Bearer <api.config.CREW_API_KEY>
```

Parameters:
```
task_id   string   required   ID of the task
content   string   required   The entry text. Use @agentname to tag another agent.
                              Example: "@leo data is ready, TACoS up 4.8pts across 3 campaigns — see above"
```

Returns: `{ id, task_id, agent_id, content, created_at }`

Backend behaviour on save:
1. Saves the entry with `agent_id = <sending agent>`
2. Parses all `@mentions` from `content`
3. For each valid `@agentname`, inserts a `notifications` row (`delivered: false`)

---

#### `crew_task_notes_update`

Overwrites this agent's private working notes for a task. Called at the end of every turn — after all other work is done — to persist context that would otherwise be lost between sessions. The dispatcher reads these notes and includes them in the next prompt so the agent can resume where it left off.

```
API:    PUT /api/tasks/:id/notes
Auth:   Bearer <api.config.CREW_API_KEY>
```

Parameters:
```
task_id   string   required   ID of the task
content   string   required   Full text of updated notes. Replaces previous notes entirely.
                              Include: what was done, what's in progress, what to do next,
                              any relevant findings to carry forward.
```

This is an upsert: `UNIQUE(task_id, agent_id)`. A row is created on first call, replaced on subsequent calls. Notes are scoped to this agent — other agents cannot read or write them.

---

#### `crew_action_create`

Records a proposed batch of changes as a single action. Used by strategy agents (@leo) when they decide on a set of PPC changes: bid adjustments, budget changes, keyword actions, campaign pauses. Groups related changes into one row rather than one row per change.

```
API:    POST /api/tasks/:id/actions
Auth:   Bearer <api.config.CREW_API_KEY>
```

Parameters:
```
task_id       string   required   ID of the task this action belongs to
entity_type   string   required   campaign | ad_group | keyword | portfolio
summary       string   required   Plain-language description of what this action does and why.
                                  Example: "Reduce bids 15% on 3 underperforming SP campaigns
                                           (ACoS >40%) based on last 14 days"
request_json  array    required   Array of individual change objects. Each object shape depends
                                  on entity_type but should include entity_id and proposed_value.
                                  Example:
                                  [
                                    { "entity_id": "12345", "field": "bid", "current": 1.20, "proposed": 1.02 },
                                    { "entity_id": "67890", "field": "bid", "current": 0.85, "proposed": 0.72 }
                                  ]
```

One `crew_action_create` call = one logical group. For example, all bid reductions from a single analysis are one action, not one per campaign. This keeps the actions table scannable.

Returns: `{ id, task_id, agent_id, entity_type, summary, request_json, status, created_at }`

---

### Turn flow (agent perspective)

Each dispatcher prompt begins with assigned tasks, notes, and mentions. The expected tool sequence per turn is:

```
1. Read the prompt — tasks, notes, mentions are already injected by dispatcher
2. Work through each task / mention
3. crew_task_entry_add   ← write findings, analysis, or handoff notes
4. crew_action_create    ← (strategy agents only) propose batched changes
5. crew_task_update      ← update status and/or summary if state has changed
6. crew_task_notes_update ← ALWAYS last — persist notes for next turn
```

Agents do not call `crew_task_list` on every turn — the dispatcher already includes the task list in the prompt. `crew_task_list` is available for agents that need to re-check task state mid-turn (e.g. clair checking whether a delegated task is already done before re-tagging an agent).

### SKILL.md (`skills/clair-tasks/SKILL.md`)

Injected into every agent's context by OpenClaw alongside the plugin tools. Explains the turn flow above in plain language. Key points it covers:

- Read your notes at the start of every turn — they contain your prior context
- Always write a task entry before tagging another agent
- To tag an agent, write `@agentname` in `crew_task_entry_add` content — no other call needed
- Always call `crew_task_notes_update` as your last action each turn
- Move task status to `in_progress` when you start, `done` when the work is complete
- Do not re-tag an agent who was already tagged in the same task unless the situation has changed

### Config summary

| Key | Source | Value |
|-----|--------|-------|
| `CREW_API_URL` | OpenClaw pod env | `https://api.internal/api` (or equivalent internal endpoint) |
| `CREW_API_KEY` | OpenClaw pod env | Shared API key for crew backend auth |
| `agentId` | `api.agentId` (set by OpenClaw) | `clair` / `maya` / `leo` / `luca` — injected from dispatch payload |

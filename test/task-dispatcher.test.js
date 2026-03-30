const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDispatchPrompt,
  sortAssignedTasks,
  sortMentions
} = require("../src/task-dispatcher");

test("sortAssignedTasks orders work by priority then creation time", () => {
  const sortedTasks = sortAssignedTasks([
    {
      id: "task-medium",
      title: "Review weekly report",
      priority: "medium",
      created_at: "2026-03-22T10:00:00.000Z"
    },
    {
      id: "task-urgent-newer",
      title: "Investigate TACoS spike",
      priority: "urgent",
      created_at: "2026-03-22T09:00:00.000Z"
    },
    {
      id: "task-urgent-older",
      title: "Fix failed webhook",
      priority: "urgent",
      created_at: "2026-03-22T08:00:00.000Z"
    }
  ]);

  assert.deepEqual(
    sortedTasks.map((task) => task.id),
    ["task-urgent-older", "task-urgent-newer", "task-medium"]
  );
});

test("sortMentions keeps mention delivery order stable by creation time", () => {
  const sortedMentions = sortMentions([
    { id: "mention-2", created_at: "2026-03-22T11:00:00.000Z" },
    { id: "mention-1", created_at: "2026-03-22T10:00:00.000Z" }
  ]);

  assert.deepEqual(
    sortedMentions.map((mention) => mention.id),
    ["mention-1", "mention-2"]
  );
});

test("buildDispatchPrompt renders assigned tasks, mentions, notes, and instructions", () => {
  const prompt = buildDispatchPrompt({
    operatingInstructions: "Read OPERATING.md before using tools.",
    assignedTasks: [
      {
        title: "Weekly campaign review",
        type: "review",
        status: "open",
        priority: "medium",
        context_json: { orgId: "acme", range: "7d" },
        notes: ""
      },
      {
        title: "Investigate TACoS spike",
        type: "analysis",
        status: "in_progress",
        priority: "urgent",
        context_json: "{\"campaignId\":\"123\"}",
        notes: "Pulled spend data last turn.",
        created_at: "2026-03-22T08:00:00.000Z"
      }
    ],
    mentions: [
      {
        task_title: "Investigate TACoS spike",
        from_agent: "leo",
        content: "@clair recommendations are ready for review",
        created_at: "2026-03-22T09:00:00.000Z"
      }
    ]
  });

  assert.match(prompt, /^Read OPERATING\.md before using tools\./);
  assert.match(prompt, /## Assigned Tasks/);
  assert.match(prompt, /1\. \[urgent\] Investigate TACoS spike/);
  assert.match(prompt, /Your notes: Pulled spend data last turn\./);
  assert.match(prompt, /2\. \[medium\] Weekly campaign review/);
  assert.match(prompt, /Context: {"orgId":"acme","range":"7d"}/);
  assert.match(prompt, /Your notes: \(none yet\)/);
  assert.match(prompt, /## Mentions/);
  assert.match(prompt, /"Investigate TACoS spike" - leo tagged you:/);
});

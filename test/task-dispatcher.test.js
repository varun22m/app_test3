const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDispatchPrompt,
  buildDeliveryPlan,
  buildAgentBundles,
  collectNotificationIds,
  deriveActiveAgents,
  getDeliveredNotificationIds,
  resolveTaskAgentId,
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

test("resolveTaskAgentId routes unowned tasks to clair by default", () => {
  assert.equal(resolveTaskAgentId({ agent_id: "maya" }), "maya");
  assert.equal(resolveTaskAgentId({ agent_id: "" }), "clair");
  assert.equal(resolveTaskAgentId({ agent_id: null }), "clair");
});

test("deriveActiveAgents collects active agents from tasks and mentions", () => {
  const activeAgents = deriveActiveAgents({
    tasks: [
      { id: "task-1", agent_id: null },
      { id: "task-2", agent_id: "leo" }
    ],
    mentions: [
      { id: "mention-1", agent_id: "maya" },
      { id: "mention-2", agent_id: "external-agent" }
    ]
  });

  assert.deepEqual(activeAgents, ["clair", "maya", "leo", "external-agent"]);
});

test("buildAgentBundles groups assigned work and mentions per active agent", () => {
  const bundles = buildAgentBundles({
    tasks: [
      {
        id: "task-1",
        title: "Unowned task",
        priority: "medium",
        agent_id: null,
        created_at: "2026-03-22T10:00:00.000Z"
      },
      {
        id: "task-2",
        title: "Leo task",
        priority: "urgent",
        agent_id: "leo",
        created_at: "2026-03-22T09:00:00.000Z"
      }
    ],
    mentions: [
      {
        id: "mention-2",
        task_title: "Task for leo",
        agent_id: "leo",
        from_agent: "clair",
        content: "@leo please review",
        created_at: "2026-03-22T11:00:00.000Z"
      },
      {
        id: "mention-1",
        task_title: "Task for maya",
        agent_id: "maya",
        from_agent: "clair",
        content: "@maya please investigate",
        created_at: "2026-03-22T08:00:00.000Z"
      }
    ]
  });

  assert.deepEqual(
    bundles.map((bundle) => bundle.agentId),
    ["clair", "maya", "leo"]
  );
  assert.deepEqual(
    bundles.find((bundle) => bundle.agentId === "clair").assignedTasks.map((task) => task.id),
    ["task-1"]
  );
  assert.deepEqual(
    bundles.find((bundle) => bundle.agentId === "maya").mentions.map((mention) => mention.id),
    ["mention-1"]
  );
  assert.deepEqual(
    bundles.find((bundle) => bundle.agentId === "leo").assignedTasks.map((task) => task.id),
    ["task-2"]
  );
});

test("collectNotificationIds keeps unique notification ids in mention order", () => {
  const notificationIds = collectNotificationIds([
    { id: " notification-2 " },
    { id: "notification-1" },
    { id: "notification-2" },
    { id: "" },
    { notAnId: true }
  ]);

  assert.deepEqual(notificationIds, ["notification-2", "notification-1"]);
});

test("buildDeliveryPlan sorts bundle work and tracks notification ids for acknowledgement", () => {
  const deliveryPlan = buildDeliveryPlan({
    agentId: "maya",
    assignedTasks: [
      {
        id: "task-2",
        title: "Review search terms",
        priority: "medium",
        created_at: "2026-03-22T11:00:00.000Z"
      },
      {
        id: "task-1",
        title: "Investigate TACoS spike",
        priority: "urgent",
        created_at: "2026-03-22T09:00:00.000Z"
      }
    ],
    mentions: [
      {
        id: "notification-2",
        task_title: "Task for maya",
        from_agent: "clair",
        content: "@maya please investigate",
        created_at: "2026-03-22T11:00:00.000Z"
      },
      {
        id: "notification-1",
        task_title: "Earlier task for maya",
        from_agent: "leo",
        content: "@maya please review first",
        created_at: "2026-03-22T08:00:00.000Z"
      }
    ]
  });

  assert.equal(deliveryPlan.agentId, "maya");
  assert.equal(deliveryPlan.shouldDispatch, true);
  assert.deepEqual(
    deliveryPlan.assignedTasks.map((task) => task.id),
    ["task-1", "task-2"]
  );
  assert.deepEqual(
    deliveryPlan.mentions.map((mention) => mention.id),
    ["notification-1", "notification-2"]
  );
  assert.deepEqual(
    deliveryPlan.notificationIds,
    ["notification-1", "notification-2"]
  );
});

test("buildDeliveryPlan skips empty bundles and exposes no notification acknowledgements", () => {
  const deliveryPlan = buildDeliveryPlan({
    agentId: "clair",
    assignedTasks: [],
    mentions: []
  });

  assert.equal(deliveryPlan.shouldDispatch, false);
  assert.deepEqual(deliveryPlan.notificationIds, []);
});

test("getDeliveredNotificationIds only acknowledges notifications after a successful dispatch", () => {
  const deliveryPlan = buildDeliveryPlan({
    agentId: "leo",
    assignedTasks: [{ id: "task-1", priority: "high", created_at: "2026-03-22T08:00:00.000Z" }],
    mentions: [
      { id: "notification-1", created_at: "2026-03-22T09:00:00.000Z" },
      { id: "notification-2", created_at: "2026-03-22T10:00:00.000Z" }
    ]
  });

  assert.deepEqual(getDeliveredNotificationIds(deliveryPlan, true), [
    "notification-1",
    "notification-2"
  ]);
  assert.deepEqual(getDeliveredNotificationIds(deliveryPlan, false), []);
  assert.deepEqual(
    getDeliveredNotificationIds(buildDeliveryPlan({ agentId: "leo", assignedTasks: [], mentions: [] }), true),
    []
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

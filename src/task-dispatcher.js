const PRIORITY_ORDER = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};
const DEFAULT_AGENT_ID = "clair";
const AGENT_ORDER = ["clair", "maya", "leo", "luca"];

function getPriorityRank(priority) {
  return PRIORITY_ORDER[priority] ?? Number.MAX_SAFE_INTEGER;
}

function compareByCreatedAt(left, right) {
  const leftTime = Date.parse(left.created_at ?? "") || 0;
  const rightTime = Date.parse(right.created_at ?? "") || 0;
  return leftTime - rightTime;
}

function sortAssignedTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const rankDifference = getPriorityRank(left.priority) - getPriorityRank(right.priority);
    if (rankDifference !== 0) {
      return rankDifference;
    }

    return compareByCreatedAt(left, right);
  });
}

function sortMentions(mentions) {
  return [...mentions].sort(compareByCreatedAt);
}

function resolveTaskAgentId(task, defaultAgentId = DEFAULT_AGENT_ID) {
  if (typeof task?.agent_id === "string" && task.agent_id.trim() !== "") {
    return task.agent_id.trim();
  }

  return defaultAgentId;
}

function deriveActiveAgents(input, options = {}) {
  const tasks = Array.isArray(input?.tasks) ? input.tasks : [];
  const mentions = Array.isArray(input?.mentions) ? input.mentions : [];
  const defaultAgentId = options.defaultAgentId ?? DEFAULT_AGENT_ID;
  const orderedAgents = options.agentOrder ?? AGENT_ORDER;
  const activeAgents = new Set();

  for (const task of tasks) {
    activeAgents.add(resolveTaskAgentId(task, defaultAgentId));
  }

  for (const mention of mentions) {
    if (typeof mention?.agent_id === "string" && mention.agent_id.trim() !== "") {
      activeAgents.add(mention.agent_id.trim());
    }
  }

  const knownAgents = orderedAgents.filter((agentId) => activeAgents.has(agentId));
  const discoveredAgents = [...activeAgents].filter((agentId) => !orderedAgents.includes(agentId));

  return [...knownAgents, ...discoveredAgents];
}

function buildAgentBundles(input, options = {}) {
  const tasks = Array.isArray(input?.tasks) ? input.tasks : [];
  const mentions = Array.isArray(input?.mentions) ? input.mentions : [];
  const defaultAgentId = options.defaultAgentId ?? DEFAULT_AGENT_ID;
  const agentIds = deriveActiveAgents({ tasks, mentions }, options);

  return agentIds.map((agentId) => ({
    agentId,
    assignedTasks: sortAssignedTasks(
      tasks.filter((task) => resolveTaskAgentId(task, defaultAgentId) === agentId)
    ),
      mentions: sortMentions(
        mentions.filter((mention) => typeof mention?.agent_id === "string" && mention.agent_id.trim() === agentId)
      )
    }));
}

function collectNotificationIds(mentions) {
  const notificationIds = [];
  const seenIds = new Set();

  for (const mention of mentions) {
    if (typeof mention?.id !== "string") {
      continue;
    }

    const notificationId = mention.id.trim();
    if (notificationId === "" || seenIds.has(notificationId)) {
      continue;
    }

    seenIds.add(notificationId);
    notificationIds.push(notificationId);
  }

  return notificationIds;
}

function buildDeliveryPlan(bundle) {
  const assignedTasks = sortAssignedTasks(bundle?.assignedTasks ?? []);
  const mentions = sortMentions(bundle?.mentions ?? []);

  return {
    agentId: bundle?.agentId,
    assignedTasks,
    mentions,
    shouldDispatch: assignedTasks.length > 0 || mentions.length > 0,
    notificationIds: collectNotificationIds(mentions)
  };
}

function getDeliveredNotificationIds(deliveryPlan, dispatchSucceeded) {
  if (!dispatchSucceeded || !deliveryPlan?.shouldDispatch) {
    return [];
  }

  return [...deliveryPlan.notificationIds];
}

function formatContext(context) {
  if (context === null || context === undefined || context === "") {
    return "(none)";
  }

  if (typeof context === "string") {
    return context;
  }

  return JSON.stringify(context);
}

function formatNotes(notes) {
  if (typeof notes !== "string" || notes.trim() === "") {
    return "(none yet)";
  }

  return notes.trim();
}

function buildAssignedTaskLines(task, index) {
  return [
    `${index + 1}. [${task.priority ?? "unknown"}] ${task.title}`,
    `   Type: ${task.type ?? "unknown"} | Status: ${task.status ?? "open"}`,
    `   Context: ${formatContext(task.context_json)}`,
    `   Your notes: ${formatNotes(task.notes)}`
  ];
}

function buildMentionLines(mention) {
  return [
    `- "${mention.task_title}" - ${mention.from_agent} tagged you:`,
    `  "${mention.content}"`
  ];
}

function buildDispatchPrompt(bundle) {
  const assignedTasks = sortAssignedTasks(bundle.assignedTasks ?? []);
  const mentions = sortMentions(bundle.mentions ?? []);
  const sections = [];

  if (typeof bundle.operatingInstructions === "string" && bundle.operatingInstructions.trim() !== "") {
    sections.push(bundle.operatingInstructions.trim());
  }

  sections.push("You have pending work:");

  if (assignedTasks.length > 0) {
    sections.push(
      "## Assigned Tasks",
      assignedTasks.flatMap(buildAssignedTaskLines).join("\n")
    );
  }

  if (mentions.length > 0) {
    sections.push(
      "## Mentions",
      mentions.map(buildMentionLines).flat().join("\n")
    );
  }

  sections.push(
    "Work through each item. Use your tools to complete the work, write your findings",
    "as task activity, update your notes, and @mention other agents if you need something."
  );

  return sections.join("\n\n");
}

module.exports = {
  AGENT_ORDER,
  DEFAULT_AGENT_ID,
  PRIORITY_ORDER,
  buildDispatchPrompt,
  buildDeliveryPlan,
  buildAgentBundles,
  collectNotificationIds,
  deriveActiveAgents,
  getDeliveredNotificationIds,
  resolveTaskAgentId,
  sortAssignedTasks,
  sortMentions
};

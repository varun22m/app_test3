const PRIORITY_ORDER = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

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
  PRIORITY_ORDER,
  buildDispatchPrompt,
  sortAssignedTasks,
  sortMentions
};

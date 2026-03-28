function createGreeting(target) {
  const value = typeof target === "string" ? target.trim() : "";
  const name = value.length > 0 ? value : "AI";
  return `Hello from ${name}!`;
}

module.exports = {
  createGreeting
};

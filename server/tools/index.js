// ===== Tool Registry =====
// Every tool exposes: name, description, parameters (JSON schema), execute(args, context)

const tools = {};

function register(tool) {
  tools[tool.name] = tool;
}

function getTool(name) {
  return tools[name];
}

function listTools() {
  return Object.values(tools).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

function getOpenAITools() {
  return Object.values(tools).map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

module.exports = { register, getTool, listTools, getOpenAITools };

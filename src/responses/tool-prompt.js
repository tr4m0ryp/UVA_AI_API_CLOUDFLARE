/*
 * Hermes-style tool system prompt builder.
 * Port of tool_prompt.c from UVA_AI_V2.
 */

function buildToolPrompt(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;

  const header =
    'You are an autonomous coding agent. You operate in a loop: '
    + 'receive a task or tool result, decide the next action, call '
    + 'the appropriate tool, and continue until the task is fully '
    + 'complete.\n'
    + 'You MUST use tools to interact with the environment. You '
    + 'cannot run commands, read files, or modify anything without '
    + 'calling a tool. Do not describe what you would do -- do it.\n'
    + 'Plan before each tool call. After receiving a tool result, '
    + 'evaluate whether the task is done. If not, call the next '
    + 'tool immediately.\n\n'
    + 'Here are the available tools:\n<tools>\n';

  let toolLines = '';
  for (const tool of tools) {
    if (tool.type && tool.type !== 'function') continue;
    const src = tool.function || tool;
    const normalized = {
      type: 'function',
      function: {
        name: src.name || 'unknown',
      },
    };
    if (src.description) normalized.function.description = src.description;
    if (src.parameters) normalized.function.parameters = src.parameters;
    toolLines += JSON.stringify(normalized) + '\n';
  }

  const footer =
    '</tools>\n\n'
    + 'To call a tool, respond with a <tool_call> block containing '
    + 'JSON with "name" and "arguments" keys:\n\n'
    + '<tool_call>\n'
    + '{"name": "TOOL_NAME", "arguments": {ARGS}}\n'
    + '</tool_call>\n\n'
    + 'RULES:\n'
    + '- Respond ONLY with <tool_call> blocks when action is needed\n'
    + '- No text before or around <tool_call> blocks\n'
    + '- Only use plain text after ALL actions are complete\n\n'
    + 'EXAMPLES:\n\n'
    + 'User: List the files in the current directory\n'
    + 'Response:\n'
    + '<tool_call>\n'
    + '{"name": "exec_command", "arguments": '
    + '{"command": ["bash", "-lc", "ls -la"]}}\n'
    + '</tool_call>\n\n'
    + 'User: Read the contents of main.py\n'
    + 'Response:\n'
    + '<tool_call>\n'
    + '{"name": "exec_command", "arguments": '
    + '{"command": ["bash", "-lc", "cat main.py"]}}\n'
    + '</tool_call>\n\n'
    + 'User: Create hello.py with a hello world program\n'
    + 'Response:\n'
    + '<tool_call>\n'
    + '{"name": "exec_command", "arguments": '
    + '{"command": ["bash", "-lc", '
    + '"printf \'print(\\"Hello, world!\\")\\n\' > hello.py"]}}\n'
    + '</tool_call>';

  return header + toolLines + footer;
}

function buildToolReminder(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;

  const names = [];
  for (const tool of tools) {
    const src = tool.function || tool;
    if (src.name) names.push(src.name);
  }

  return 'Available tools: ' + names.join(', ')
    + '\nUse <tool_call>{"name":"...","arguments":{...}}</tool_call> format.';
}

module.exports = { buildToolPrompt, buildToolReminder };

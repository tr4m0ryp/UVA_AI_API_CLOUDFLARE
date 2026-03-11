const TC_NONE = 0;
const TC_AUTO = 1;
const TC_REQUIRED = 2;

function parseRequest(body) {
  const req = {
    model: body.model || '',
    instructions: body.instructions || '',
    stream: body.stream !== undefined ? !!body.stream : true,
    hasTools: false,
    tools: null,
    toolChoice: TC_AUTO,
    previousResponseId: body.previous_response_id || '',
    input: body.input || null,
    temperature: body.temperature !== undefined ? body.temperature : -1,
    maxTokens: body.max_tokens || body.max_output_tokens || 0,
    topP: body.top_p !== undefined ? body.top_p : -1,
  };

  if (Array.isArray(body.tools) && body.tools.length > 0) {
    req.hasTools = true;
    req.tools = body.tools;
  }

  if (body.tool_choice) {
    if (typeof body.tool_choice === 'string') {
      if (body.tool_choice === 'none') req.toolChoice = TC_NONE;
      else if (body.tool_choice === 'required') req.toolChoice = TC_REQUIRED;
    }
  }

  /* Force required when tools are present and choice is auto */
  if (req.hasTools && req.toolChoice === TC_AUTO) {
    req.toolChoice = TC_REQUIRED;
    console.error('  [responses] tools present: forcing tool_choice auto -> required');
  }

  return req;
}

module.exports = { parseRequest, TC_NONE, TC_AUTO, TC_REQUIRED };

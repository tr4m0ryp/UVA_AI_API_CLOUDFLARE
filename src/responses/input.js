/*
 * Normalize the Responses API "input" field to a standard messages array.
 * Port of input.c from UVA_AI_V2.
 */

function extractTextFromParts(parts) {
  if (!Array.isArray(parts)) return '';
  let text = '';
  for (const part of parts) {
    if (!part || !part.type) continue;
    if (part.type === 'text' || part.type === 'input_text' || part.type === 'output_text') {
      if (part.text) text += part.text;
    }
  }
  return text;
}

function inputToMessages(input, instructions) {
  const messages = [];

  /* Prepend system message from instructions */
  if (instructions) {
    messages.push({ role: 'system', content: instructions });
  }

  if (!input) return messages;

  /* Case 1: input is a string */
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
    return messages;
  }

  /* Case 2: input is an array of items */
  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item) continue;

      /* Standard message with role */
      if (item.role) {
        const role = item.role === 'developer' ? 'system' : item.role;
        let content = '';
        if (Array.isArray(item.content)) {
          content = extractTextFromParts(item.content);
        } else if (typeof item.content === 'string') {
          content = item.content;
        }
        messages.push({ role, content });
        continue;
      }

      /* Type-based items */
      if (!item.type) continue;

      if (item.type === 'message') {
        const role = item.role || 'user';
        let content = '';
        if (typeof item.content === 'string') {
          content = item.content;
        } else if (Array.isArray(item.content)) {
          content = extractTextFromParts(item.content);
        }
        messages.push({ role, content });

      } else if (item.type === 'function_call') {
        /* Format as <tool_call> XML so the model sees the same delimiters */
        const fn = item.name || 'unknown';
        const args = item.arguments || '{}';
        const content = '<tool_call>\n'
          + '{"name": "' + fn + '", "arguments": ' + args + '}\n'
          + '</tool_call>';
        messages.push({ role: 'assistant', content });

      } else if (item.type === 'function_call_output') {
        /* Keep for foldToolResults() to process */
        messages.push(item);
      }
    }
  }

  return messages;
}

function foldToolResults(messages) {
  for (let i = 0; i < messages.length; i++) {
    const item = messages[i];
    if (!item || item.type !== 'function_call_output') continue;

    const callId = item.call_id || '';
    const output = item.output || '';

    /* Format as <tool_response> XML */
    const escapedOutput = JSON.stringify(output);
    const content = '<tool_response>\n'
      + '{"call_id": "' + callId + '", "output": ' + escapedOutput + '}\n'
      + '</tool_response>';

    messages[i] = { role: 'user', content };
  }
}

module.exports = { inputToMessages, foldToolResults };

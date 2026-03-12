/*
 * Direct MCP tool execution -- bypasses UvA's broken extension calling.
 *
 * When UvA's SSE stream contains tool-input-available events, we intercept
 * the tool call parameters and execute them directly against the MCP servers
 * (via the mcpo-bridge at frogbytes.xyz). UvA's backend fails to forward
 * parameters in its POST to the tool server, so we do it ourselves.
 */
const https = require('https');
const http = require('http');

/* MCP server endpoints -- the mcpo-bridge routes by hostname */
const TOOL_ENDPOINTS = {
  /* Shell tools */
  execute_command: 'https://shell.frogbytes.xyz',
  /* Filesystem tools */
  read_file: 'https://fs.frogbytes.xyz',
  read_text_file: 'https://fs.frogbytes.xyz',
  read_media_file: 'https://fs.frogbytes.xyz',
  read_multiple_files: 'https://fs.frogbytes.xyz',
  write_file: 'https://fs.frogbytes.xyz',
  edit_file: 'https://fs.frogbytes.xyz',
  create_directory: 'https://fs.frogbytes.xyz',
  list_directory: 'https://fs.frogbytes.xyz',
  list_directory_with_sizes: 'https://fs.frogbytes.xyz',
  directory_tree: 'https://fs.frogbytes.xyz',
  move_file: 'https://fs.frogbytes.xyz',
  search_files: 'https://fs.frogbytes.xyz',
  get_file_info: 'https://fs.frogbytes.xyz',
  list_allowed_directories: 'https://fs.frogbytes.xyz',
};

/* Execute a tool call directly against the MCP server.
 * Returns the JSON result or an error string. */
function executeTool(toolName, input) {
  const baseUrl = TOOL_ENDPOINTS[toolName];
  if (!baseUrl) {
    return Promise.resolve({ error: 'Unknown tool: ' + toolName });
  }

  const toolUrl = new URL('/' + toolName, baseUrl);
  const body = JSON.stringify(input || {});
  const transport = toolUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const reqOpts = {
      hostname: toolUrl.hostname,
      port: toolUrl.port || (toolUrl.protocol === 'https:' ? 443 : 80),
      path: toolUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = transport.request(reqOpts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          resolve({ error: 'Tool server error ' + res.statusCode + ': ' + data.slice(0, 200) });
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      resolve({ error: 'Tool execution failed: ' + err.message });
    });
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ error: 'Tool execution timeout' });
    });
    req.write(body);
    req.end();
  });
}

/* Parse a UvA SSE line and extract tool-related events.
 * Returns { type, toolCallId, toolName, input, output } or null. */
function parseToolEvent(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let data = trimmed;
  if (data.startsWith('data: ')) data = data.slice(6);
  if (!data || data === '[DONE]') return null;

  try {
    const obj = JSON.parse(data);
    if (obj.type === 'tool-input-available') {
      return {
        type: 'tool-input',
        toolCallId: obj.toolCallId,
        toolName: obj.toolName,
        input: obj.input,
      };
    }
    if (obj.type === 'tool-output-available') {
      return {
        type: 'tool-output',
        toolCallId: obj.toolCallId,
        output: obj.output,
      };
    }
  } catch {
    /* not JSON */
  }
  return null;
}

module.exports = { executeTool, parseToolEvent, TOOL_ENDPOINTS };

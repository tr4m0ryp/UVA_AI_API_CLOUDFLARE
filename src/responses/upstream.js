/*
 * Translate messages to UvA format and send to backend.
 * Port of handler.c, handler_buffered.c, and route_tools.c translation logic.
 */
const http = require('http');
const https = require('https');
const { genId } = require('./id-gen');
const { executeTool, parseToolEvent, TOOL_ENDPOINTS } = require('./tool-exec');

/* Fold all messages into UvA's single-message format.
 * All messages except the last are combined with role labels.
 * extensions: { threadId, toolIds, toolServers, features } -- optional UvA extension config
 *
 * Key insight: UvA links extensions to chat threads in its DB. When a threadId
 * with extensions is used, the backend loads those extensions and makes their
 * tools available to the model. Random thread IDs have no extensions linked.
 *
 * isNewChat must be false when reusing an extension-linked thread, otherwise
 * the backend treats it as a new conversation and does not load extensions. */
function translateToUva(messages, model, opts, extensions) {
  /* Use the configured thread ID if extensions provide one (has extensions linked).
   * MCP extensions are loaded from UvA's DB based on the thread, so we must
   * reuse the extension-linked thread. Fresh threads only get built-in tools. */
  const hasExtThread = !!(extensions && extensions.threadId);
  const threadId = hasExtThread ? extensions.threadId : genId('thread_', 16);

  let combined = '';
  const last = messages[messages.length - 1];

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const role = msg.role || 'user';
    let label;
    if (role === 'system') label = '[SYSTEM]';
    else if (role === 'assistant') label = '[ASSISTANT]';
    else label = '[USER]';

    if (msg.type === 'function_call_output') {
      label = '[TOOL RESULT]';
    }

    combined += label + '\n' + (msg.content || '') + '\n\n';
  }

  /* Final message content = combined history + last message */
  let finalContent;
  if (combined) {
    finalContent = combined + (last.content || '');
  } else {
    finalContent = last.content || '';
  }

  const msgId = genId('msg_', 12);
  const body = {
    id: threadId,
    message: {
      id: msgId,
      role: 'user',
      parts: [{ type: 'text', text: finalContent }],
    },
    flags: {
      studyMode: false,
      enforceInternetSearch: false,
      enforceArtifactCreation: false,
      enforceImageGeneration: false,
      regenerate: false,
      continue: false,
      isNewChat: true,
    },
    overrides: {
      model: model || 'gpt-5.1',
      personaId: '',
    },
    requestTime: new Date().toISOString(),
  };

  if (opts && opts.temperature >= 0) body.overrides.temperature = opts.temperature;
  if (opts && opts.maxTokens > 0) body.overrides.maxTokens = opts.maxTokens;
  if (opts && opts.topP >= 0) body.overrides.topP = opts.topP;

  /* Inject UvA extension/tool fields when configured */
  if (extensions) {
    if (extensions.toolIds && extensions.toolIds.length > 0) {
      body.tool_ids = extensions.toolIds;
    }
    if (extensions.toolServers && extensions.toolServers.length > 0) {
      body.tool_servers = extensions.toolServers;
    }
    if (extensions.features) {
      body.features = extensions.features;
    }
  }

  return { body: JSON.stringify(body), threadId };
}

/* Build an OpenAI-format request for /api/chat/completions.
 * Used when the chat endpoint is set to chat_completions. */
function translateToOpenAI(messages, model, opts, extensions) {
  const body = {
    model: model || 'gpt-5.1',
    messages: messages.map(function(msg) {
      return { role: msg.role || 'user', content: msg.content || '' };
    }),
    stream: true,
  };

  if (opts && opts.temperature >= 0) body.temperature = opts.temperature;
  if (opts && opts.maxTokens > 0) body.max_tokens = opts.maxTokens;
  if (opts && opts.topP >= 0) body.top_p = opts.topP;

  /* Include extension fields for Open WebUI tool processing */
  if (extensions) {
    if (extensions.toolIds && extensions.toolIds.length > 0) {
      body.tool_ids = extensions.toolIds;
    }
    if (extensions.toolServers && extensions.toolServers.length > 0) {
      body.tool_servers = extensions.toolServers;
    }
    if (extensions.features) {
      body.features = extensions.features;
    }
  }

  return JSON.stringify(body);
}

/* Parse tokens from Vercel AI SDK Data Stream SSE lines */
function parseToken(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed === '[DONE]') return null;

  /* Strip "data: " prefix if present */
  let data = trimmed;
  if (data.startsWith('data: ')) data = data.slice(6);
  if (!data || data === '[DONE]') return null;

  try {
    const obj = JSON.parse(data);
    /* Vercel AI SDK format */
    if (obj.type === 'text-delta' && obj.delta !== undefined) {
      return obj.delta;
    }
    /* Simple content format */
    if (obj.content !== undefined && obj.content !== null) {
      return obj.content;
    }
    /* OpenAI-compatible format */
    if (obj.choices && obj.choices[0] && obj.choices[0].delta &&
        obj.choices[0].delta.content !== undefined) {
      return obj.choices[0].delta.content;
    }
  } catch {
    /* Not JSON -- return as plain text token if non-empty */
    if (data.length > 0 && !data.startsWith('{') && !data.startsWith('[')) {
      return data;
    }
  }
  return null;
}

/* Send request to UvA backend and buffer all tokens.
 * extensions: optional { toolIds, toolServers, features }
 * endpoint: optional override path (default: /api/v1/chat) */
function bufferUpstream(messages, model, baseUrl, cookie, opts, extensions, endpoint) {
  return new Promise((resolve, reject) => {
    let body;
    const chatPath = endpoint || '/api/v1/chat';
    if (chatPath === '/api/chat/completions') {
      body = translateToOpenAI(messages, model, opts, extensions);
    } else {
      body = translateToUva(messages, model, opts, extensions).body;
    }

    const url = new URL(chatPath, baseUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:138.0) Gecko/20100101 Firefox/138.0',
        'Cookie': cookie,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    let accumulated = '';
    let buffer = '';

    const req = transport.request(reqOpts, (res) => {
      if (res.statusCode >= 500) {
        let errBody = '';
        res.on('data', (c) => { errBody += c; });
        res.on('end', () => reject(new Error('Upstream error: ' + res.statusCode)));
        return;
      }

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop(); /* keep incomplete line */
        for (const line of lines) {
          const token = parseToken(line);
          if (token !== null) accumulated += token;
        }
      });

      res.on('end', () => {
        /* Process remaining buffer */
        if (buffer.trim()) {
          const token = parseToken(buffer);
          if (token !== null) accumulated += token;
        }
        resolve(accumulated);
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error('Upstream request timeout'));
    });
    req.write(body);
    req.end();
  });
}

/* Send request to UvA backend and stream tokens via SSE.
 * extensions: optional { toolIds, toolServers, features }
 * endpoint: optional override path (default: /api/v1/chat) */
function streamUpstream(res, messages, model, baseUrl, cookie, opts, callbacks, extensions, endpoint) {
  return new Promise((resolve, reject) => {
    let body;
    const chatPath = endpoint || '/api/v1/chat';
    if (chatPath === '/api/chat/completions') {
      body = translateToOpenAI(messages, model, opts, extensions);
    } else {
      body = translateToUva(messages, model, opts, extensions).body;
    }

    const url = new URL(chatPath, baseUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:138.0) Gecko/20100101 Firefox/138.0',
        'Cookie': cookie,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    let accumulated = '';
    let firstToken = true;
    let buffer = '';

    const req = transport.request(reqOpts, (upstreamRes) => {
      if (upstreamRes.statusCode >= 500) {
        reject(new Error('Upstream error: ' + upstreamRes.statusCode));
        return;
      }

      upstreamRes.setEncoding('utf8');
      upstreamRes.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const token = parseToken(line);
          if (token === null) continue;
          if (firstToken) {
            firstToken = false;
            if (callbacks.onFirstToken) callbacks.onFirstToken();
          }
          accumulated += token;
          if (callbacks.onToken) callbacks.onToken(token);
        }
      });

      upstreamRes.on('end', () => {
        if (buffer.trim()) {
          const token = parseToken(buffer);
          if (token !== null) {
            if (firstToken && callbacks.onFirstToken) {
              firstToken = false;
              callbacks.onFirstToken();
            }
            accumulated += token;
            if (callbacks.onToken) callbacks.onToken(token);
          }
        }
        if (callbacks.onDone) callbacks.onDone(accumulated);
        resolve(accumulated);
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error('Upstream request timeout'));
    });
    req.write(body);
    req.end();
  });
}

/* Send a single request to UvA and collect the full SSE stream as raw lines.
 * Returns { lines[], text, toolCalls[], failedTools[] }. */
function rawUpstream(bodyStr, baseUrl, cookie, endpoint) {
  return new Promise((resolve, reject) => {
    const chatPath = endpoint || '/api/v1/chat';
    const url = new URL(chatPath, baseUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:138.0) Gecko/20100101 Firefox/138.0',
        'Cookie': cookie,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    let text = '';
    let buffer = '';
    const toolCalls = [];   /* { toolCallId, toolName, input } */
    const failedTools = []; /* { toolCallId, error } */

    const req = transport.request(reqOpts, (res) => {
      if (res.statusCode >= 500) {
        let errBody = '';
        res.on('data', (c) => { errBody += c; });
        res.on('end', () => reject(new Error('Upstream ' + res.statusCode)));
        return;
      }

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const ev = parseToolEvent(line);
          if (ev) {
            if (ev.type === 'tool-input') {
              toolCalls.push({ toolCallId: ev.toolCallId, toolName: ev.toolName, input: ev.input });
            } else if (ev.type === 'tool-output' && ev.output && ev.output.error) {
              failedTools.push({ toolCallId: ev.toolCallId, error: ev.output.error });
            }
          }
          const token = parseToken(line);
          if (token !== null) text += token;
        }
      });

      res.on('end', () => {
        if (buffer.trim()) {
          const ev = parseToolEvent(buffer);
          if (ev) {
            if (ev.type === 'tool-input') {
              toolCalls.push({ toolCallId: ev.toolCallId, toolName: ev.toolName, input: ev.input });
            } else if (ev.type === 'tool-output' && ev.output && ev.output.error) {
              failedTools.push({ toolCallId: ev.toolCallId, error: ev.output.error });
            }
          }
          const token = parseToken(buffer);
          if (token !== null) text += token;
        }
        resolve({ text, toolCalls, failedTools });
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(new Error('Upstream timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

/* Buffer upstream with tool execution loop.
 * When UvA's extension calling fails (empty body bug), we intercept the tool
 * call from the SSE stream, execute it ourselves, and send the result back
 * to UvA as a follow-up message. Repeats until the model gives a final text
 * response with no more tool calls (max 10 iterations). */
async function bufferWithToolExec(messages, model, baseUrl, cookie, opts, extensions, endpoint) {
  const MAX_ITERATIONS = 10;
  const chatPath = endpoint || '/api/v1/chat';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const bodyStr = chatPath === '/api/chat/completions'
      ? translateToOpenAI(messages, model, opts, extensions)
      : translateToUva(messages, model, opts, extensions).body;

    const result = await rawUpstream(bodyStr, baseUrl, cookie, chatPath);

    /* Check if there were tool calls that failed */
    const knownTools = result.toolCalls.filter(
      (tc) => tc.toolName in TOOL_ENDPOINTS
    );
    const hasFailedKnownTools = knownTools.length > 0 && result.failedTools.length > 0;

    if (!hasFailedKnownTools) {
      /* No interceptable tool failures -- return the text as-is */
      return result.text;
    }

    /* Execute the failed tools ourselves */
    console.error('  [tool-exec] intercepting %d failed tool call(s), executing directly',
      knownTools.length);

    let toolResultText = '';
    for (const tc of knownTools) {
      console.error('  [tool-exec] executing %s(%s)', tc.toolName, JSON.stringify(tc.input).slice(0, 100));
      const toolResult = await executeTool(tc.toolName, tc.input);
      const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
      console.error('  [tool-exec] result: %s', resultStr.slice(0, 200));
      toolResultText += '[Tool: ' + tc.toolName + ']\n' + resultStr + '\n\n';
    }

    /* Append the model's attempted response and our tool results as a follow-up.
     * UvA will see these in the conversation history on the next request. */
    if (result.text) {
      messages.push({ role: 'assistant', content: result.text });
    }
    messages.push({
      role: 'user',
      content: 'Tool execution results:\n\n' + toolResultText
        + 'Continue based on these tool results. '
        + 'Do NOT call the same tools again -- use the results above.',
    });
  }

  return 'Tool execution loop exceeded maximum iterations.';
}

/* Stream upstream with tool execution loop.
 * Same as bufferWithToolExec but for streaming mode. First buffers internally
 * while running the tool execution loop, then streams the final response. */
async function streamWithToolExec(res, messages, model, baseUrl, cookie, opts, callbacks, extensions, endpoint) {
  const MAX_ITERATIONS = 10;
  const chatPath = endpoint || '/api/v1/chat';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLast = (i === MAX_ITERATIONS - 1);
    const bodyStr = chatPath === '/api/chat/completions'
      ? translateToOpenAI(messages, model, opts, extensions)
      : translateToUva(messages, model, opts, extensions).body;

    const result = await rawUpstream(bodyStr, baseUrl, cookie, chatPath);

    const knownTools = result.toolCalls.filter(
      (tc) => tc.toolName in TOOL_ENDPOINTS
    );
    const hasFailedKnownTools = knownTools.length > 0 && result.failedTools.length > 0;

    if (!hasFailedKnownTools || isLast) {
      /* Final response -- stream it to the client */
      if (callbacks.onFirstToken) callbacks.onFirstToken();
      if (result.text && callbacks.onToken) callbacks.onToken(result.text);
      if (callbacks.onDone) callbacks.onDone(result.text);
      return result.text;
    }

    /* Execute failed tools */
    console.error('  [tool-exec] stream: intercepting %d failed tool call(s)', knownTools.length);

    let toolResultText = '';
    for (const tc of knownTools) {
      console.error('  [tool-exec] executing %s', tc.toolName);
      const toolResult = await executeTool(tc.toolName, tc.input);
      const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
      console.error('  [tool-exec] result: %s', resultStr.slice(0, 200));
      toolResultText += '[Tool: ' + tc.toolName + ']\n' + resultStr + '\n\n';
    }

    if (result.text) {
      messages.push({ role: 'assistant', content: result.text });
    }
    messages.push({
      role: 'user',
      content: 'Tool execution results:\n\n' + toolResultText
        + 'Continue based on these tool results. '
        + 'Do NOT call the same tools again -- use the results above.',
    });
  }

  if (callbacks.onFirstToken) callbacks.onFirstToken();
  if (callbacks.onDone) callbacks.onDone('');
  return '';
}

module.exports = {
  bufferUpstream, streamUpstream, translateToUva, translateToOpenAI,
  bufferWithToolExec, streamWithToolExec,
};

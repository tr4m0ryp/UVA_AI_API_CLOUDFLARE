/*
 * Translate messages to UvA format and send to backend.
 * Port of handler.c, handler_buffered.c, and route_tools.c translation logic.
 */
const http = require('http');
const https = require('https');
const { genId } = require('./id-gen');

/* Fold all messages into UvA's single-message format.
 * All messages except the last are combined with role labels. */
function translateToUva(messages, model, opts) {
  const threadId = genId('thread_', 16);

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

  return { body: JSON.stringify(body), threadId };
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

/* Send request to UvA backend and buffer all tokens. */
function bufferUpstream(messages, model, baseUrl, cookie, opts) {
  return new Promise((resolve, reject) => {
    const { body } = translateToUva(messages, model, opts);

    const url = new URL('/api/v1/chat', baseUrl);
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

/* Send request to UvA backend and stream tokens via SSE. */
function streamUpstream(res, messages, model, baseUrl, cookie, opts, callbacks) {
  return new Promise((resolve, reject) => {
    const { body } = translateToUva(messages, model, opts);

    const url = new URL('/api/v1/chat', baseUrl);
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

module.exports = { bufferUpstream, streamUpstream, translateToUva };

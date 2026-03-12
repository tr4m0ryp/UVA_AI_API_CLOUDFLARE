/*
 * POST /v1/responses -- Native Responses API with tool-use orchestration.
 * Port of route.c from UVA_AI_V2.
 *
 * Supports two tool modes:
 *   1. UvA extensions (server-side): tool_ids / tool_servers sent to UvA backend,
 *      which executes tools via MCP and returns the final response.
 *   2. Hermes prompt injection (client-side): tool definitions injected into
 *      system prompt, model responds with <tool_call> XML, client executes.
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { genId } = require('./id-gen');
const { parseRequest, TC_NONE } = require('./request-parser');
const { inputToMessages, foldToolResults } = require('./input');
const { buildToolPrompt, buildToolReminder } = require('./tool-prompt');
const { tryParseTools } = require('./tool-parse');
const { stripToolCalls } = require('./tool-strip');
const { bufferUpstream, streamUpstream, bufferWithToolExec, streamWithToolExec } = require('./upstream');
const state = require('./state');
const emitter = require('./emitter');

const CONTINUATION_MSG =
  'Your previous response was text only -- no tool was called and '
  + 'no action was taken. The task requires tool use to make progress.'
  + '\n\nRespond with a <tool_call> block. Example:\n'
  + '<tool_call>\n'
  + '{"name": "exec_command", "arguments": '
  + '{"command": ["bash", "-lc", "ls"]}}\n'
  + '</tool_call>\n\n'
  + 'Respond ONLY with <tool_call> blocks. No other text.';

/* Resolve UvA cookie from session token or ai_settings */
function resolveCookie(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    const session = db.getDb().prepare(
      'SELECT uva_cookie FROM sessions WHERE token = ?'
    ).get(token);
    if (session && session.uva_cookie) return session.uva_cookie;
  }
  /* Fallback: statically configured cookie */
  const row = db.getDb().prepare(
    "SELECT value FROM ai_settings WHERE key = 'uva_cookie'"
  ).get();
  return row ? row.value : null;
}

function getAiSetting(key) {
  const row = db.getDb().prepare(
    'SELECT value FROM ai_settings WHERE key = ?'
  ).get(key);
  return row ? row.value : null;
}

/* Load UvA extension config from ai_settings.
 * Returns { threadId, toolIds, toolServers, features } or null.
 *
 * The key field is thread_id: a UvA chat thread that has extensions linked
 * to it on the backend. When we send messages using that thread ID, the
 * UvA backend loads the linked extensions (Filesystem, Shell, Memory, etc.)
 * and makes their tools available to the model.
 *
 * Config format in ai_settings:
 * {
 *   "thread_id": "DWoS7vzbAPfBwSW6Y977MHmZ61ODRnLzdAvm",
 *   "tool_ids": [],       // optional: explicit tool IDs
 *   "tool_servers": [],   // optional: MCP server configs
 *   "features": {}        // optional: feature flags
 * }
 */
function loadExtensions() {
  const raw = getAiSetting('enabled_extensions');
  if (!raw) return null;

  try {
    const cfg = JSON.parse(raw);
    const ext = {};
    let hasAny = false;

    if (cfg.thread_id && typeof cfg.thread_id === 'string') {
      ext.threadId = cfg.thread_id;
      hasAny = true;
    }
    if (Array.isArray(cfg.tool_ids) && cfg.tool_ids.length > 0) {
      ext.toolIds = cfg.tool_ids;
      hasAny = true;
    } else if (Array.isArray(cfg.extension_ids) && cfg.extension_ids.length > 0) {
      ext.toolIds = cfg.extension_ids;
      hasAny = true;
    }
    if (Array.isArray(cfg.tool_servers) && cfg.tool_servers.length > 0) {
      ext.toolServers = cfg.tool_servers;
      hasAny = true;
    }
    if (cfg.features && typeof cfg.features === 'object') {
      ext.features = cfg.features;
      hasAny = true;
    }

    return hasAny ? ext : null;
  } catch {
    console.error('  [responses] invalid enabled_extensions JSON in ai_settings');
    return null;
  }
}

function startSse(res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();
}

router.post('/', async (req, res) => {
  const cookie = resolveCookie(req);
  if (!cookie) {
    return res.status(401).json({
      error: { message: 'No UvA session configured. Set cookie via dashboard or use a valid session token.' },
    });
  }

  const baseUrl = 'https://aichat.uva.nl';

  const rr = parseRequest(req.body);
  if (!rr.model) {
    rr.model = getAiSetting('default_model') || 'gpt-5.1';
  }

  /* Load UvA extensions and chat endpoint from settings */
  const extensions = loadExtensions();
  const chatEndpoint = getAiSetting('chat_endpoint') || '/api/v1/chat';
  /* Always use native extensions when configured. The gateway handles tool
   * execution server-side (intercepting failed UvA calls), and the model
   * returns a complete text response with tool results incorporated.
   * Client-sent tool definitions are not used (Hermes mode doesn't work
   * because UvA's system prompt overrides injected tool definitions). */
  const useNativeTools = !!extensions;

  console.error('  [responses] model=%s stream=%s tools=%s prev=%s extensions=%s endpoint=%s',
    rr.model, rr.stream, rr.hasTools, rr.previousResponseId,
    useNativeTools ? 'yes' : 'no', chatEndpoint);

  const result = {
    responseId: genId('resp_', 16),
    msgId: genId('msg_', 12),
    fullText: '',
    toolCalls: [],
    seq: 0,
  };

  /* Load prior messages for multi-turn */
  let messages;
  let priorMessages = null;
  if (rr.previousResponseId) {
    const priorJson = state.load(rr.previousResponseId);
    if (priorJson) {
      try { priorMessages = JSON.parse(priorJson); } catch {}
      state.remove(rr.previousResponseId);
    }
  }

  messages = inputToMessages(rr.input, rr.instructions);
  foldToolResults(messages);

  /* Merge prior messages */
  if (priorMessages && Array.isArray(priorMessages)) {
    messages = priorMessages.concat(messages);
  }

  const injectTools = rr.hasTools && rr.toolChoice !== TC_NONE;
  const opts = {
    temperature: rr.temperature,
    maxTokens: rr.maxTokens,
    topP: rr.topP,
  };

  try {
    if (useNativeTools) {
      /*
       * UvA native extension mode with gateway-side tool execution.
       * UvA's backend has a bug where it doesn't forward tool parameters
       * to extension endpoints. We intercept tool calls from the SSE stream,
       * execute them directly against the MCP servers, and send the results
       * back to UvA as follow-up messages.
       */
      if (rr.stream) {
        startSse(res);
        result.fullText = await streamWithToolExec(res, messages, rr.model, baseUrl, cookie, opts, {
          onFirstToken() {
            emitter.emitCreated(res, result, rr.model);
            emitter.emitOutputItemAdded(res, result, rr.model);
            emitter.emitContentPartAdded(res, result);
          },
          onToken(token) {
            emitter.emitTextDelta(res, result, token);
          },
          onDone(fullText) {
            result.fullText = fullText;
            emitter.emitTextDone(res, result);
            emitter.emitContentPartDone(res, result);
            emitter.emitOutputItemDone(res, result, rr.model);
            emitter.emitCompleted(res, result, rr.model);
          },
        }, extensions, chatEndpoint);
        res.end();
      } else {
        result.fullText = await bufferWithToolExec(messages, rr.model, baseUrl, cookie, opts, extensions, chatEndpoint);
        res.json(emitter.buildNonstreamResponse(result, rr.model));
      }

    } else if (injectTools) {
      /*
       * Hermes prompt injection mode (client-side tools):
       * Tool definitions are injected into the system prompt.
       * Model responds with <tool_call> XML blocks.
       * Client is responsible for executing tools and sending results back.
       */
      const toolPrompt = buildToolPrompt(rr.tools);
      if (toolPrompt) {
        messages = [{ role: 'system', content: toolPrompt }, ...messages];
      }

      /* Buffer full response (no SSE during buffering) */
      result.fullText = await bufferUpstream(messages, rr.model, baseUrl, cookie, opts);

      /* Parse tool calls */
      const parsed = tryParseTools(result.fullText);
      if (parsed.toolCalls.length > 0) {
        result.toolCalls = parsed.toolCalls;
        result.fullText = stripToolCalls(result.fullText);
      } else if (rr.toolChoice !== TC_NONE) {
        /* Continuation check: nudge model to use tools */
        await continuationCheck(messages, rr, baseUrl, cookie, opts, result);
      }

      /* Now emit SSE or JSON */
      if (rr.stream) {
        startSse(res);
        emitter.emitResultSse(res, result, rr.model);
        res.end();
      } else {
        res.json(emitter.buildNonstreamResponse(result, rr.model));
      }

    } else {
      /* No tools: stream or buffer as requested */
      if (rr.stream) {
        startSse(res);
        result.fullText = await streamUpstream(res, messages, rr.model, baseUrl, cookie, opts, {
          onFirstToken() {
            emitter.emitCreated(res, result, rr.model);
            emitter.emitOutputItemAdded(res, result, rr.model);
            emitter.emitContentPartAdded(res, result);
          },
          onToken(token) {
            emitter.emitTextDelta(res, result, token);
          },
          onDone(fullText) {
            result.fullText = fullText;
            emitter.emitTextDone(res, result);
            emitter.emitContentPartDone(res, result);
            emitter.emitOutputItemDone(res, result, rr.model);
            emitter.emitCompleted(res, result, rr.model);
          },
        });
        res.end();
      } else {
        result.fullText = await bufferUpstream(messages, rr.model, baseUrl, cookie, opts);
        res.json(emitter.buildNonstreamResponse(result, rr.model));
      }
    }
  } catch (err) {
    console.error('  [responses] upstream error:', err.message);
    if (!res.headersSent) {
      return res.status(502).json({ error: { message: 'Upstream error: ' + err.message } });
    }
    res.end();
    return;
  }

  /* Save state for multi-turn */
  saveState(messages, result);
});

function saveState(messages, result) {
  if (result.toolCalls.length > 0) {
    let tcContent = '';
    for (const tc of result.toolCalls) {
      tcContent += '<tool_call>\n'
        + '{"name": "' + tc.name + '", "arguments": ' + tc.arguments + '}\n'
        + '</tool_call>\n';
    }
    messages.push({ role: 'assistant', content: tcContent });
  } else if (result.fullText) {
    messages.push({ role: 'assistant', content: result.fullText });
  }
  state.save(result.responseId, JSON.stringify(messages));
}

async function continuationCheck(messages, rr, baseUrl, cookie, opts, result) {
  console.error('  [responses] continuation check: no tool calls, verifying task completion');

  const originalText = result.fullText;
  result.fullText = '';
  result.toolCalls = [];

  /* Append model's text as assistant message */
  messages.push({ role: 'assistant', content: originalText || '' });
  /* Append nudge as user message */
  messages.push({ role: 'user', content: CONTINUATION_MSG });
  /* Re-inject compact tool reminder */
  const reminder = buildToolReminder(rr.tools);
  if (reminder) {
    messages.push({ role: 'system', content: reminder });
  }

  try {
    result.fullText = await bufferUpstream(messages, rr.model, baseUrl, cookie, opts);
    const parsed = tryParseTools(result.fullText);
    if (parsed.toolCalls.length > 0) {
      result.toolCalls = parsed.toolCalls;
      result.fullText = stripToolCalls(result.fullText);
      console.error('  [responses] continuation check: model continued with %d tool call(s)',
        result.toolCalls.length);
      return;
    }
  } catch (err) {
    console.error('  [responses] continuation check error:', err.message);
  }

  /* Model confirmed task complete; use original text */
  console.error('  [responses] continuation check: task confirmed complete');
  result.fullText = originalText;
  result.toolCalls = [];
}

module.exports = router;

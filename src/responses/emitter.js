/*
 * SSE event construction for the Responses API.
 * Port of emitter.c from UVA_AI_V2.
 *
 * Each event: "event: TYPE\ndata: JSON\n\n"
 * Each data payload includes "type" and "sequence_number" fields.
 */

function sendEvent(res, eventType, data, result) {
  result.seq++;
  data.type = eventType;
  data.sequence_number = result.seq;
  res.write('event: ' + eventType + '\ndata: ' + JSON.stringify(data) + '\n\n');
}

function buildSkeleton(result, model, status) {
  return {
    id: result.responseId,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status,
    model,
    output: [],
    parallel_tool_calls: true,
    usage: null,
    metadata: {},
  };
}

function buildMessageItem(result, model, text, status) {
  const content = [];
  if (text !== null && text !== undefined) {
    content.push({
      type: 'output_text',
      text,
      annotations: [],
    });
  }
  return {
    type: 'message',
    id: result.msgId,
    status,
    role: 'assistant',
    content,
  };
}

function buildFuncCallItem(tc, status) {
  return {
    type: 'function_call',
    id: tc.callId,
    status,
    name: tc.name,
    call_id: tc.callId,
    arguments: tc.arguments,
  };
}

function emitCreated(res, result, model) {
  const resp = buildSkeleton(result, model, 'in_progress');
  sendEvent(res, 'response.created', { response: resp }, result);
}

function emitOutputItemAdded(res, result, model) {
  const item = buildMessageItem(result, model, null, 'in_progress');
  sendEvent(res, 'response.output_item.added', {
    output_index: 0,
    item,
  }, result);
}

function emitContentPartAdded(res, result) {
  sendEvent(res, 'response.content_part.added', {
    item_id: result.msgId,
    output_index: 0,
    content_index: 0,
    part: {
      type: 'output_text',
      text: '',
      annotations: [],
    },
  }, result);
}

function emitTextDelta(res, result, delta) {
  sendEvent(res, 'response.output_text.delta', {
    item_id: result.msgId,
    output_index: 0,
    content_index: 0,
    delta,
  }, result);
}

function emitTextDone(res, result) {
  sendEvent(res, 'response.output_text.done', {
    item_id: result.msgId,
    output_index: 0,
    content_index: 0,
    text: result.fullText || '',
  }, result);
}

function emitContentPartDone(res, result) {
  sendEvent(res, 'response.content_part.done', {
    item_id: result.msgId,
    output_index: 0,
    content_index: 0,
    part: {
      type: 'output_text',
      text: result.fullText || '',
      annotations: [],
    },
  }, result);
}

function emitOutputItemDone(res, result, model) {
  const item = buildMessageItem(result, model, result.fullText || '', 'completed');
  sendEvent(res, 'response.output_item.done', {
    output_index: 0,
    item,
  }, result);
}

function emitCompleted(res, result, model) {
  const resp = buildSkeleton(result, model, 'completed');

  if (result.toolCalls && result.toolCalls.length > 0) {
    for (const tc of result.toolCalls) {
      resp.output.push(buildFuncCallItem(tc, 'completed'));
    }
  } else {
    resp.output.push(buildMessageItem(result, model, result.fullText || '', 'completed'));
  }

  resp.usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

  sendEvent(res, 'response.completed', { response: resp }, result);
}

function emitFuncCallAdded(res, result, idx, model) {
  const item = buildFuncCallItem(result.toolCalls[idx], 'in_progress');
  sendEvent(res, 'response.output_item.added', {
    output_index: idx,
    item,
  }, result);
}

function emitFuncCallArgsDelta(res, result, idx) {
  sendEvent(res, 'response.function_call_arguments.delta', {
    item_id: result.toolCalls[idx].callId,
    output_index: idx,
    delta: result.toolCalls[idx].arguments,
  }, result);
}

function emitFuncCallArgsDone(res, result, idx) {
  sendEvent(res, 'response.function_call_arguments.done', {
    item_id: result.toolCalls[idx].callId,
    output_index: idx,
    arguments: result.toolCalls[idx].arguments,
  }, result);
}

function emitFuncCallItemDone(res, result, idx, model) {
  const item = buildFuncCallItem(result.toolCalls[idx], 'completed');
  sendEvent(res, 'response.output_item.done', {
    output_index: idx,
    item,
  }, result);
}

/* Emit all SSE events for a completed result (tool calls or text). */
function emitResultSse(res, result, model) {
  emitCreated(res, result, model);

  if (result.toolCalls && result.toolCalls.length > 0) {
    for (let i = 0; i < result.toolCalls.length; i++) {
      emitFuncCallAdded(res, result, i, model);
      emitFuncCallArgsDelta(res, result, i);
      emitFuncCallArgsDone(res, result, i);
      emitFuncCallItemDone(res, result, i, model);
    }
  } else {
    emitOutputItemAdded(res, result, model);
    emitContentPartAdded(res, result);
    emitTextDone(res, result);
    emitContentPartDone(res, result);
    emitOutputItemDone(res, result, model);
  }

  emitCompleted(res, result, model);
}

/* Build a non-streaming JSON response. */
function buildNonstreamResponse(result, model) {
  const resp = buildSkeleton(result, model, 'completed');

  if (result.toolCalls && result.toolCalls.length > 0) {
    for (const tc of result.toolCalls) {
      resp.output.push(buildFuncCallItem(tc, 'completed'));
    }
  } else {
    resp.output.push(buildMessageItem(result, model, result.fullText || '', 'completed'));
  }

  resp.usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  return resp;
}

module.exports = {
  emitCreated,
  emitOutputItemAdded,
  emitContentPartAdded,
  emitTextDelta,
  emitTextDone,
  emitContentPartDone,
  emitOutputItemDone,
  emitCompleted,
  emitFuncCallAdded,
  emitFuncCallArgsDelta,
  emitFuncCallArgsDone,
  emitFuncCallItemDone,
  emitResultSse,
  buildNonstreamResponse,
};

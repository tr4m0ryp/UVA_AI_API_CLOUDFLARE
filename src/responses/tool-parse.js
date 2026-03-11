/*
 * Parse <tool_call> XML blocks and loose JSON from model output.
 * Port of tool_parse.c and tool_parse_loose.c from UVA_AI_V2.
 */
const { genId } = require('./id-gen');

function normalizeCloseTags(text) {
  return text.replace(/<\\\//g, '</');
}

/* Strip markdown code fences and remove trailing commas before } or ] */
function repairJson(raw) {
  let s = raw.trim();

  /* Strip ```json or ``` prefix */
  if (s.startsWith('```')) {
    const nl = s.indexOf('\n');
    if (nl >= 0) s = s.slice(nl + 1);
    else {
      const brace = s.indexOf('{');
      if (brace >= 0) s = s.slice(brace);
    }
  }

  /* Strip trailing ``` */
  s = s.trimEnd();
  if (s.endsWith('```')) s = s.slice(0, -3).trimEnd();

  /* Remove trailing commas before } or ] */
  let out = '';
  let inString = false;
  let prevNonWs = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      out += c;
      if (c === '"' && (i === 0 || s[i - 1] !== '\\')) inString = false;
      continue;
    }
    if (c === '"') inString = true;
    if ((c === '}' || c === ']') && prevNonWs === ',') {
      /* Remove the trailing comma */
      let k = out.length;
      while (k > 0 && ' \n\r\t'.includes(out[k - 1])) k--;
      if (k > 0 && out[k - 1] === ',') out = out.slice(0, k - 1) + out.slice(k);
    }
    out += c;
    if (!' \n\r\t'.includes(c)) prevNonWs = c;
  }
  return out;
}

/* Extract arguments, handling double-serialized strings */
function extractArguments(obj) {
  if (!obj.arguments) return '{}';
  if (typeof obj.arguments === 'string') {
    try {
      const parsed = JSON.parse(obj.arguments);
      return JSON.stringify(parsed);
    } catch {
      return obj.arguments;
    }
  }
  return JSON.stringify(obj.arguments);
}

/* Parse <tool_call>/<function_call> XML blocks */
function parseToolCalls(text, maxCalls) {
  if (!text || maxCalls <= 0) return [];
  const norm = normalizeCloseTags(text);
  const calls = [];
  let p = 0;

  while (calls.length < maxCalls) {
    const tcIdx = norm.indexOf('<tool_call>', p);
    const fcIdx = norm.indexOf('<function_call>', p);

    let start, openLen, closeTag;
    if (tcIdx >= 0 && (fcIdx < 0 || tcIdx <= fcIdx)) {
      start = tcIdx;
      openLen = 11;
      closeTag = '</tool_call>';
    } else if (fcIdx >= 0) {
      start = fcIdx;
      openLen = 15;
      closeTag = '</function_call>';
    } else {
      break;
    }

    const contentStart = start + openLen;
    const end = norm.indexOf(closeTag, contentStart);
    if (end < 0) break;

    const content = norm.slice(contentStart, end).trim();

    let obj;
    try {
      obj = JSON.parse(content);
    } catch {
      try {
        obj = JSON.parse(repairJson(content));
      } catch {
        p = end + closeTag.length;
        continue;
      }
    }

    if (!obj.name) {
      p = end + closeTag.length;
      continue;
    }

    calls.push({
      name: String(obj.name),
      arguments: extractArguments(obj),
      callId: genId('call_', 24),
    });

    p = end + closeTag.length;
  }

  return calls;
}

/* Loose JSON extraction: scan for {"name":"..."} patterns */
function extractLooseJson(text, maxCalls) {
  if (!text || maxCalls <= 0) return [];
  const calls = [];
  let p = 0;

  while (calls.length < maxCalls && p < text.length) {
    const anchor = text.indexOf('"name"', p);
    if (anchor < 0) break;

    /* Backtrack to nearest { */
    let brace = anchor;
    while (brace > 0 && text[brace] !== '{') brace--;
    if (text[brace] !== '{') { p = anchor + 6; continue; }

    /* Brace-depth matching */
    let depth = 0;
    let inStr = false;
    let matchEnd = -1;
    for (let i = brace; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === '\\') { i++; continue; }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { matchEnd = i + 1; break; }
      }
    }
    if (matchEnd < 0) { p = anchor + 6; continue; }

    const candidate = text.slice(brace, matchEnd);
    let obj;
    try {
      obj = JSON.parse(repairJson(candidate));
    } catch {
      p = matchEnd;
      continue;
    }

    if (!obj.name || typeof obj.name !== 'string') {
      p = matchEnd;
      continue;
    }

    calls.push({
      name: obj.name,
      arguments: extractArguments(obj),
      callId: genId('call_', 24),
    });
    console.error('  [responses] loose JSON extraction: ' + obj.name);
    p = matchEnd;
  }

  return calls;
}

/* Try XML parsing first, fall back to loose JSON */
function tryParseTools(fullText) {
  const MAX_CALLS = 16;
  let toolCalls = parseToolCalls(fullText, MAX_CALLS);
  if (toolCalls.length > 0) {
    return { toolCalls, usedLoose: false };
  }
  toolCalls = extractLooseJson(fullText, MAX_CALLS);
  return { toolCalls, usedLoose: toolCalls.length > 0 };
}

module.exports = { parseToolCalls, extractLooseJson, tryParseTools, repairJson };

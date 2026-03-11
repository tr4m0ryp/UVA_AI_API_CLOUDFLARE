/*
 * Strip <tool_call>/<function_call> blocks from text.
 * Port of tool_strip.c from UVA_AI_V2.
 */

function normalizeCloseTags(text) {
  return text.replace(/<\\\//g, '</');
}

function stripToolCalls(text) {
  if (!text) return '';
  const norm = normalizeCloseTags(text);
  let out = '';
  let p = 0;

  while (p < norm.length) {
    const tcIdx = norm.indexOf('<tool_call>', p);
    const fcIdx = norm.indexOf('<function_call>', p);

    let start = -1;
    let closeTag = '';

    if (tcIdx >= 0 && (fcIdx < 0 || tcIdx <= fcIdx)) {
      start = tcIdx;
      closeTag = '</tool_call>';
    } else if (fcIdx >= 0) {
      start = fcIdx;
      closeTag = '</function_call>';
    }

    if (start < 0) {
      out += norm.slice(p);
      break;
    }

    out += norm.slice(p, start);
    const end = norm.indexOf(closeTag, start);
    if (end >= 0) {
      p = end + closeTag.length;
    } else {
      out += norm.slice(start);
      break;
    }
  }

  return out.trimEnd();
}

module.exports = { stripToolCalls };

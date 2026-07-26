// Reads/writes .env for the admin Settings page. Deliberately line-based
// rather than a full round-trip AST — updates only touch the exact KEY=value
// lines being changed, leaving every comment, blank line, and unrelated key
// byte-for-byte untouched.

const KV_RE = /^([A-Z][A-Z0-9_]*)=(.*)$/;
const SECTION_RE = /^#\s*-{2,}\s*(.+?)\s*-{2,}\s*$/;
const COMMENT_RE = /^#\s*(.*)$/;

// Field names matching this are never sent to the browser in plaintext —
// covers *_API_KEY, *_TOKEN, *_PASSWORD, *_SECRET across every service this
// app talks to, without needing a hardcoded per-key list that'd go stale as
// new integrations are added.
function isSecretKey(key) {
  return /SECRET|TOKEN|PASSWORD|API_KEY/i.test(key);
}

function isBooleanValue(value) {
  return value === 'true' || value === 'false';
}

// Unwraps a value exactly the way dotenv itself does, so what the UI shows
// matches what the app is actually using.
function unquote(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return trimmed;
}

// Parses .env text into a flat list of editable fields, grouping consecutive
// entries under the nearest preceding "# ---- Section ----" comment, and
// attaching any plain comment line directly above a field as its description.
function parseFields(text) {
  const fields = [];
  let section = null;
  let description = null;
  for (const line of text.split('\n')) {
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      section = sectionMatch[1];
      description = null;
      continue;
    }
    const kvMatch = line.match(KV_RE);
    if (kvMatch) {
      fields.push({ key: kvMatch[1], value: unquote(kvMatch[2]), section, description });
      description = null;
      continue;
    }
    const commentMatch = line.trim() && line.match(COMMENT_RE);
    if (commentMatch) {
      description = commentMatch[1];
      continue;
    }
    description = null; // blank line resets — a comment only describes the field directly below it
  }
  return fields;
}

// Quotes a value only when it actually needs it (contains whitespace, a #,
// or a quote character) — keeps the file looking hand-written for the
// common case instead of quoting every single value.
function formatValue(value) {
  if (/[\s#"]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

// Rewrites only the KEY=value lines named in `updates` ({KEY: newValue}),
// leaving comments, blank lines, ordering, and every other key untouched.
function applyUpdates(text, updates) {
  return text.split('\n').map(line => {
    const m = line.match(KV_RE);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
      return `${m[1]}=${formatValue(updates[m[1]])}`;
    }
    return line;
  }).join('\n');
}

module.exports = { parseFields, applyUpdates, isSecretKey, isBooleanValue };

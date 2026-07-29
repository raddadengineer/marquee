// Pure origin-vs-host comparison used by server.js's CSRF middleware — split
// out so the actual decision logic is unit-testable without spinning up Express.
// Returns 'ok' | 'missing' | 'invalid' | 'mismatch'.
function checkOrigin(originHeader, hostHeader) {
  if (!originHeader) return 'missing';
  let originHost;
  try {
    originHost = new URL(originHeader).host;
  } catch {
    return 'invalid';
  }
  return originHost === hostHeader ? 'ok' : 'mismatch';
}

module.exports = { checkOrigin };

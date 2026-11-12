/**
 * React's rules of hooks across the app: a hook called after an early return (or inside an if) runs on some renders and
 * not others, and React crashes the app when the count changes (a Volunteer event's screen did, on opening, once its
 * data loaded). The lint script has older problems, so this runs only that rule, from the project's ESLint config.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ESLint } from 'eslint';

test('hooks are called in the same order on every render (no hook after an early return)', { timeout: 240_000 }, async () => {
  const eslint = new ESLint({
    cwd: join(__dirname, '..'),
    ruleFilter: ({ ruleId }) => ruleId === 'react-hooks/rules-of-hooks',
  });
  const results = await eslint.lintFiles(['app', 'src']);
  const found = results.flatMap((r) => r.messages
    .filter((m) => m.ruleId === 'react-hooks/rules-of-hooks' || m.fatal)
    .map((m) => `${r.filePath.replace(/.*\/(app|src)\//, '$1/')}:${m.line} ${m.message}`));
  assert.deepEqual(found, [], `Move these hooks above any early return:\n${found.join('\n')}`);
});

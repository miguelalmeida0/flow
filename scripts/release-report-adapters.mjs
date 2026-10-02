import { relative } from 'node:path';

const fileName = (file, root) => (file.startsWith(root) ? relative(root, file) : file).replaceAll('\\', '/');
export const testIdentity = (file, name, root = process.cwd()) => JSON.stringify([fileName(file, root), name]);
export function vitestInventory(report, root) {
  if (!Array.isArray(report)) throw new Error('invalid Vitest collection');
  return report.map(row => testIdentity(row.file, row.name, root));
}
export function vitestResults(report, root) {
  if (!Array.isArray(report.testResults)) throw new Error('missing Vitest suites');
  const results = report.testResults.flatMap(suite => suite.assertionResults.map(row => ({ id: testIdentity(suite.name, row.fullName, root), status: row.status, retry: row.meta?.retryCount ?? 0 })));
  const errors = report.testResults.flatMap(suite => suite.message ? [suite.message] : []);
  if (results.length !== report.numTotalTests || report.numPendingTestSuites || report.numTodoTests || report.numPendingTests) errors.push('Vitest counts incomplete');
  if (report.success !== true) errors.push('Vitest run unsuccessful');
  return { results, errors };
}
export function playwrightResults(report) {
  const results = [];
  function visit(suites, parents = []) {
    for (const suite of suites ?? []) {
      const titles = suite.file && suite.title === suite.file ? parents : [...parents, suite.title].filter(Boolean);
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
        const id = testIdentity(`e2e/${spec.file.replace(/^e2e\//, '')}`, JSON.stringify([test.projectName, ...titles, spec.title]));
        const attempts = test.results ?? [];
        results.push({ id, status: attempts.length === 1 && attempts[0].status === 'passed' && test.expectedStatus === 'passed' ? 'passed' : attempts.at(-1)?.status ?? 'not-run', retry: attempts.length ? Math.max(attempts.length - 1, ...attempts.map(result => result.retry ?? 0)) : 0, repeat: report.config?.projects?.find(project => project.id === test.projectId)?.repeatEach === 1 ? 0 : undefined });
      }
      visit(suite.suites, titles);
    }
  }
  visit(report.suites);
  return { results, errors: report.errors ?? ['missing Playwright error list'] };
}

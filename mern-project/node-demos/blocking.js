import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function runBlockingDemo(filePath) {
  const events = ['1. Before blocking read'];
  const startedAt = Date.now();
  fs.readFileSync(filePath, 'utf8');
  events.push(`2. After blocking read (${Date.now() - startedAt} ms)`);
  events.push('3. The next statement waits until the read finishes');
  return { mode: 'blocking', events };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = runBlockingDemo(new URL('./sample.txt', import.meta.url));
  console.log(result.events.join('\n'));
}
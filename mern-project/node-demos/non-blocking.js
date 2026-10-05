import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function runNonBlockingDemo(filePath, callback) {
  const events = ['1. Before non-blocking read'];

  fs.readFile(filePath, 'utf8', (error) => {
    if (error) {
      callback(error);
      return;
    }

    events.push('3. Callback: file read finished');
    callback(null, { mode: 'non-blocking', events });
  });

  events.push('2. This line runs before the callback');
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runNonBlockingDemo(new URL('./sample.txt', import.meta.url), (error, result) => {
    if (error) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    console.log(result.events.join('\n'));
  });
}

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

export function analyzeFile(filePath, callback) {
  fs.access(filePath, fs.constants.R_OK, (accessError) => {
    if (accessError) {
      callback(accessError);
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      if (statError) {
        callback(statError);
        return;
      }

      let lineCount = 0;
      const lineReader = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });

      lineReader.on('line', () => {
        lineCount += 1;
      });

      lineReader.on('close', () => {
        callback(null, {
          exists: true,
          readable: true,
          isDirectory: stats.isDirectory(),
          sizeInBytes: stats.size,
          lineCount,
        });
      });

      lineReader.on('error', callback);
    });
  });
}

export function readFileContent(filePath, callback) {
  fs.readFile(filePath, 'utf8', callback);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const filePath = new URL('./sample.txt', import.meta.url);

  analyzeFile(filePath, (error, details) => {
    if (error) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    console.log('File operation results:', details);
    console.log('File content, read line by line:');

    const lineReader = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    lineReader.on('line', (line) => console.log(`- ${line}`));
  });
}

import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeForComparison } = require("./outputNormalization");
const execAsync = promisify(exec);

const TIMEOUT_MS = 10000;

/**
 * Run user code with the given input using Docker (same approach as worker).
 * Returns stdout+stderr or an error string. Used for learning module test cases.
 */
export async function runCodeWithInput(
  code: string,
  language: string,
  input: string
): Promise<string> {
  const absoluteCodeDir = path.resolve(__dirname, "../../tmp/test-run-" + Date.now());
  await fs.mkdir(absoluteCodeDir, { recursive: true });

  let codeFilePath = "";
  let dockerCommand = "";
  const inputFilePath = path.join(absoluteCodeDir, "input.txt");

  try {
    await fs.writeFile(inputFilePath, input ?? "", "utf8");

    switch (language) {
      case "javascript": {
        codeFilePath = path.join(absoluteCodeDir, "userCode.js");
        await fs.writeFile(codeFilePath, code);
        const dir = absoluteCodeDir.replace(/\\/g, "/");
        dockerCommand = `docker run --rm --memory="256m" --cpus="1.0" --pids-limit 100 -v "${dir}:/usr/src/app" node:18 sh -c "node /usr/src/app/userCode.js < /usr/src/app/input.txt"`;
        break;
      }
      case "python": {
        codeFilePath = path.join(absoluteCodeDir, "userCode.py");
        await fs.writeFile(codeFilePath, code);
        const dir = absoluteCodeDir.replace(/\\/g, "/");
        dockerCommand = `docker run --rm --memory="256m" --cpus="1.0" --pids-limit 100 -v "${dir}:/usr/src/app" python:3.9 sh -c "python /usr/src/app/userCode.py < /usr/src/app/input.txt"`;
        break;
      }
      default:
        await fs.rm(absoluteCodeDir, { recursive: true, force: true });
        return `Error: Unsupported language for tests: ${language}`;
    }

    const { stdout, stderr } = await execAsync(dockerCommand, {
      timeout: TIMEOUT_MS,
    });
    const result = (stdout || "") + (stderr ? "\n" + stderr : "");
    return result;
  } catch (err: any) {
    const message = err.stderr || err.stdout || err.message || String(err);
    return `Error: ${message}`;
  } finally {
    try {
      await fs.rm(absoluteCodeDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

// Backwards‑compatible export name for existing imports.
export const normalizeOutput = normalizeForComparison;

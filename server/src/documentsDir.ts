import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

let cached: string | undefined;

function profileDocuments(): string {
  return path.join(homedir(), "Documents");
}

/**
 * Documents folder Explorer and Farming Simulator use.
 * OneDrive folder backup moves that folder, while %USERPROFILE%\Documents can stay behind.
 */
export function documentsDir(): string {
  if (cached) return cached;
  cached = profileDocuments();
  if (process.platform !== "win32") return cached;
  const resolved = windowsDocumentsDir();
  if (resolved) cached = resolved;
  return cached;
}

function windowsDocumentsDir(): string | null {
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; [Environment]::GetFolderPath('MyDocuments')",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 10000 },
    );
    const line = out
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find((part) => part.length > 0);
    if (!line || !path.isAbsolute(line)) return null;
    return line;
  } catch {
    return null;
  }
}

export interface UploadEntry {
  file: File;
  relativePath: string;
}

export interface UploadPayload {
  entries: UploadEntry[];
  emptyFolderPaths?: string[];
}

export interface SplitRelativePathResult {
  folderSegments: string[];
  fileName: string;
  parentFolderPath: string | null;
}

/**
 * Normalizes any file or folder relative path to clean POSIX-style segments,
 * stripping leading/trailing slashes and dangerous "." / ".." traversal parts.
 */
export function normalizeRelativePath(raw: string): string {
  const parts = (raw || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..');
  return parts.join('/');
}

/**
 * Splits a normalized relative path such as "Proyek/assets/logo.png" into
 * its parent folder segments ("Proyek", "assets"), file name ("logo.png"),
 * and joined parent path ("Proyek/assets").
 */
export function splitRelativePath(rawPath: string): SplitRelativePathResult {
  const normalized = normalizeRelativePath(rawPath);
  if (!normalized) {
    return {
      folderSegments: [],
      fileName: 'file',
      parentFolderPath: null,
    };
  }
  const parts = normalized.split('/');
  const fileName = parts[parts.length - 1] || 'file';
  const folderSegments = parts.slice(0, -1);
  return {
    folderSegments,
    fileName,
    parentFolderPath:
      folderSegments.length > 0 ? folderSegments.join('/') : null,
  };
}

/**
 * Returns every unique ancestor and target folder path required for a batch
 * of upload entries plus any empty directories, sorted top-down by depth so
 * parent folders are guaranteed to precede children.
 */
export function collectUniqueFolderPaths(
  entries: Array<{ relativePath: string }>,
  emptyFolderPaths: string[] = []
): string[] {
  const set = new Set<string>();

  const addAncestors = (segments: string[]) => {
    let acc = '';
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      set.add(acc);
    }
  };

  for (const entry of entries) {
    const { folderSegments } = splitRelativePath(entry.relativePath);
    if (folderSegments.length > 0) {
      addAncestors(folderSegments);
    }
  }

  for (const dirPath of emptyFolderPaths) {
    const clean = normalizeRelativePath(dirPath);
    if (clean) {
      addAncestors(clean.split('/'));
    }
  }

  return Array.from(set).sort((a, b) => {
    const depthDiff = a.split('/').length - b.split('/').length;
    return depthDiff !== 0 ? depthDiff : a.localeCompare(b);
  });
}

/**
 * Normalizes either a raw File[] (e.g. from <input webkitdirectory>) or an
 * already-extracted UploadPayload (from drag-and-drop directory traversal).
 */
export function normalizeUploadInput(
  input: File[] | UploadPayload
): { entries: UploadEntry[]; emptyFolderPaths: string[] } {
  if (Array.isArray(input)) {
    const entries: UploadEntry[] = input.map((file) => {
      const rel = (file as File & { webkitRelativePath?: string })
        .webkitRelativePath;
      const cleanRel = normalizeRelativePath(rel || file.name);
      return {
        file,
        relativePath: cleanRel || file.name || 'file',
      };
    });
    return { entries, emptyFolderPaths: [] };
  }

  const entries = (input.entries || []).map((entry) => ({
    file: entry.file,
    relativePath:
      normalizeRelativePath(entry.relativePath || entry.file.name) ||
      entry.file.name ||
      'file',
  }));
  const emptyFolderPaths = (input.emptyFolderPaths || [])
    .map(normalizeRelativePath)
    .filter(Boolean);

  return { entries, emptyFolderPaths };
}

interface WebkitFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
}

interface WebkitFileEntry extends WebkitFileSystemEntry {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (err: unknown) => void
  ) => void;
}

interface WebkitDirectoryReader {
  readEntries: (
    successCallback: (entries: WebkitFileSystemEntry[]) => void,
    errorCallback?: (err: unknown) => void
  ) => void;
}

interface WebkitDirectoryEntry extends WebkitFileSystemEntry {
  createReader: () => WebkitDirectoryReader;
}

function readFileFromEntry(entry: WebkitFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readAllDirectoryEntries(
  dirEntry: WebkitDirectoryEntry
): Promise<WebkitFileSystemEntry[]> {
  const reader = dirEntry.createReader();
  const collected: WebkitFileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<WebkitFileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (!batch || batch.length === 0) break;
    collected.push(...batch);
  }
  return collected;
}

async function traverseEntry(
  entry: WebkitFileSystemEntry,
  parentPath: string,
  entries: UploadEntry[],
  emptyFolderPaths: string[]
): Promise<void> {
  const currentPath = normalizeRelativePath(
    parentPath ? `${parentPath}/${entry.name}` : entry.name
  );

  if (entry.isFile) {
    try {
      const file = await readFileFromEntry(entry as WebkitFileEntry);
      entries.push({
        file,
        relativePath: currentPath || file.name,
      });
    } catch {
      // Skip unreadable file handle safely
    }
    return;
  }

  if (entry.isDirectory) {
    try {
      const children = await readAllDirectoryEntries(
        entry as WebkitDirectoryEntry
      );
      if (children.length === 0 && currentPath) {
        emptyFolderPaths.push(currentPath);
        return;
      }
      for (const child of children) {
        await traverseEntry(child, currentPath, entries, emptyFolderPaths);
      }
    } catch {
      if (currentPath) {
        emptyFolderPaths.push(currentPath);
      }
    }
  }
}

/**
 * Extracts files and nested folder paths from a browser Drag-and-Drop event,
 * recursively reading directories via DataTransferItem.webkitGetAsEntry().
 */
export async function extractDroppedUploadItems(
  dataTransfer: DataTransfer | null
): Promise<UploadPayload> {
  if (!dataTransfer) {
    return { entries: [], emptyFolderPaths: [] };
  }

  const items = Array.from(dataTransfer.items || []);
  const webkitEntries = items
    .map((item) => {
      const withEntry = item as unknown as {
        webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
      };
      return typeof withEntry.webkitGetAsEntry === 'function'
        ? withEntry.webkitGetAsEntry()
        : null;
    })
    .filter((entry): entry is WebkitFileSystemEntry => entry !== null);

  if (webkitEntries.length > 0) {
    const entries: UploadEntry[] = [];
    const emptyFolderPaths: string[] = [];
    for (const rootEntry of webkitEntries) {
      await traverseEntry(rootEntry, '', entries, emptyFolderPaths);
    }
    if (entries.length > 0 || emptyFolderPaths.length > 0) {
      return { entries, emptyFolderPaths };
    }
  }

  const fallbackFiles = Array.from(dataTransfer.files || []).filter(
    // Filter out browser 0-byte directory stubs that have no extension/type when entry traversal wasn't available
    (f) => f.size > 0 || f.type !== '' || f.name.includes('.')
  );
  return normalizeUploadInput(fallbackFiles);
}

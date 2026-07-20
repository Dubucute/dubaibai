// ===== Tool: Filesystem Operations =====
// Create folders and write files safely with path traversal protection.
const fs = require("fs");
const path = require("path");
const { register } = require("./index");

// Allowed base directory for file creation (project root or user-specified)
const BASE_DIR = path.resolve(__dirname, "..", ".."); // dubu-ai root
// Allow writing outside by default - the user is controlling their own machine
const WRITE_ROOT = process.env.DUBU_WRITE_ROOT || BASE_DIR;

/**
 * Resolve and validate a file path to prevent directory traversal.
 * Returns the resolved absolute path or null if invalid.
 */
function resolveSafePath(filePath) {
  // Normalize the path
  const normalized = path.normalize(filePath).replace(/^\.\.(\/|\\)?/, "");
  const resolved = path.resolve(WRITE_ROOT, normalized);

  // Ensure the resolved path is within the writable root
  if (!resolved.startsWith(path.resolve(WRITE_ROOT))) {
    return null;
  }

  return resolved;
}

register({
  name: "create_file",
  description:
    "Create a file with content. Automatically creates parent directories if they do not exist. Use this when the user asks to save code to a file.",
  parameters: {
    type: "object",
    properties: {
      filepath: {
        type: "string",
        description: 'Relative path to the file (e.g., "src/app.js" or "my-project/index.html").',
      },
      content: {
        type: "string",
        description: "The file content to write.",
      },
      overwrite: {
        type: "boolean",
        description: "Whether to overwrite if the file exists.",
        default: false,
      },
    },
    required: ["filepath", "content"],
  },

  async execute(args) {
    const { filepath, content, overwrite = false } = args;

    if (!filepath || typeof filepath !== "string") {
      throw new Error("File path is required.");
    }

    const safePath = resolveSafePath(filepath);
    if (!safePath) {
      throw new Error(`Invalid file path: "${filepath}". Path traversal is not allowed.`);
    }

    // Check if file exists
    if (fs.existsSync(safePath) && !overwrite) {
      return {
        success: false,
        error: `File already exists: "${filepath}". Set overwrite: true to overwrite.`,
        path: safePath,
        relativePath: filepath,
      };
    }

    // Create parent directories
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the file
    fs.writeFileSync(safePath, content, "utf-8");

    return {
      success: true,
      path: safePath,
      relativePath: filepath,
      size: Buffer.byteLength(content, "utf-8"),
      action: fs.existsSync(safePath) && overwrite ? "overwritten" : "created",
    };
  },
});

register({
  name: "create_folder",
  description:
    "Create a folder (and all parent folders if needed). Use this when the user asks to set up a project structure.",
  parameters: {
    type: "object",
    properties: {
      folderpath: {
        type: "string",
        description: 'Relative path to the folder (e.g., "my-project/src/components").',
      },
    },
    required: ["folderpath"],
  },

  async execute(args) {
    const { folderpath } = args;

    if (!folderpath || typeof folderpath !== "string") {
      throw new Error("Folder path is required.");
    }

    const safePath = resolveSafePath(folderpath);
    if (!safePath) {
      throw new Error(`Invalid folder path: "${folderpath}". Path traversal is not allowed.`);
    }

    if (fs.existsSync(safePath)) {
      return {
        success: true,
        path: safePath,
        relativePath: folderpath,
        action: "exists",
        message: `Folder already exists: "${folderpath}"`,
      };
    }

    fs.mkdirSync(safePath, { recursive: true });

    return {
      success: true,
      path: safePath,
      relativePath: folderpath,
      action: "created",
    };
  },
});

register({
  name: "read_file",
  description:
    "Read the contents of a file. Use this when the user wants to view, analyze, or edit an existing file.",
  parameters: {
    type: "object",
    properties: {
      filepath: {
        type: "string",
        description: 'Relative path to the file (e.g., "src/app.js" or "README.md").',
      },
      maxSize: {
        type: "number",
        description: "Maximum file size in bytes to read (default 1MB).",
        default: 1048576,
      },
    },
    required: ["filepath"],
  },

  async execute(args) {
    const { filepath, maxSize = 1048576 } = args;

    if (!filepath || typeof filepath !== "string") {
      throw new Error("File path is required.");
    }

    const safePath = resolveSafePath(filepath);
    if (!safePath) {
      throw new Error(`Invalid file path: "${filepath}". Path traversal is not allowed.`);
    }

    if (!fs.existsSync(safePath)) {
      return { success: false, error: `File not found: "${filepath}"`, path: filepath };
    }

    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      return { success: false, error: `"${filepath}" is a directory, not a file.`, path: filepath };
    }

    if (stat.size > maxSize) {
      return {
        success: false,
        error: `File is too large (${(stat.size / 1024).toFixed(1)}KB). Maximum is ${(maxSize / 1024).toFixed(0)}KB.`,
        path: filepath,
        size: stat.size,
      };
    }

    // Try to detect encoding - read as UTF-8 by default
    let content;
    try {
      content = fs.readFileSync(safePath, "utf-8");
    } catch (e) {
      content = fs.readFileSync(safePath, "latin1");
    }

    const ext = path.extname(filepath).toLowerCase();
    const binaryExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".bmp",
      ".ico",
      ".webp",
      ".mp3",
      ".mp4",
      ".avi",
      ".mov",
      ".zip",
      ".gz",
      ".tar",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".pdf",
      ".ttf",
      ".otf",
      ".woff",
      ".woff2",
    ];
    const isBinary = binaryExtensions.includes(ext);

    return {
      success: true,
      path: safePath,
      relativePath: filepath,
      content: isBinary ? "[Binary file - cannot display]" : content,
      size: stat.size,
      isBinary,
      extension: ext,
      lines: isBinary ? 0 : content.split("\n").length,
    };
  },
});

register({
  name: "list_files",
  description:
    "List files and folders in a directory. Use this to see the current project structure.",
  parameters: {
    type: "object",
    properties: {
      dirpath: {
        type: "string",
        description: "Relative path to the directory to list (defaults to root).",
        default: ".",
      },
      maxDepth: {
        type: "number",
        description: "Maximum depth to traverse (default 2).",
        default: 2,
      },
    },
  },

  async execute(args) {
    const { dirpath = ".", maxDepth = 2 } = args;

    const safePath = resolveSafePath(dirpath);
    if (!safePath) {
      throw new Error(`Invalid directory path: "${dirpath}".`);
    }

    if (!fs.existsSync(safePath)) {
      return { success: true, path: dirpath, entries: [], note: "Directory does not exist yet." };
    }

    const stat = fs.statSync(safePath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: "${dirpath}".`);
    }

    function readDir(dir, depth) {
      if (depth > maxDepth) {return [];}
      const entries = [];
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const relativePath = path.relative(safePath, fullPath);
          try {
            const itemStat = fs.statSync(fullPath);
            const isDir = itemStat.isDirectory();
            entries.push({
              name: item,
              path: relativePath.replace(/\\/g, "/"),
              type: isDir ? "directory" : "file",
              size: isDir ? null : itemStat.size,
            });
            if (isDir) {
              entries.push(...readDir(fullPath, depth + 1));
            }
          } catch (e) {
            entries.push({ name: item, path: relativePath, type: "unknown", error: e.message });
          }
        }
      } catch (e) {
        // Permission issues
      }
      return entries;
    }

    const entries = readDir(safePath, 0);
    return { success: true, path: dirpath, entries };
  },
});


import AsyncStorage from "@react-native-async-storage/async-storage";

const FILES_KEY = "@digital_archive_files_v2";
const TAGS_KEY = "@digital_archive_tags_v2";
const CATEGORIES_KEY = "@digital_archive_categories_v2";

export type FileStatus = "AVAILABLE" | "MISSING";

export type ArchiveFile = {
  id: string;
  name: string;
  originalName: string;
  type: string;
  size: number;
  originalUri: string;
  archiveUri: string;
  importedAt: string;
  modifiedAt: string | null;
  tags: string[];
  category: string;
  status: FileStatus;
};

function normalizeFile(
  value: Partial<ArchiveFile> & Record<string, unknown>
): ArchiveFile {
  const originalName =
    typeof value.originalName === "string"
      ? value.originalName
      : "";

  const name =
    typeof value.name === "string" && value.name.trim()
      ? value.name
      : originalName || "Untitled file";

  return {
    id:
      typeof value.id === "string"
        ? value.id
        : `${Date.now()}-${Math.random()}`,

    name,
    originalName: originalName || name,

    type:
      typeof value.type === "string"
        ? value.type
        : "application/octet-stream",

    size:
      typeof value.size === "number" &&
      Number.isFinite(value.size)
        ? value.size
        : 0,

    originalUri:
      typeof value.originalUri === "string"
        ? value.originalUri
        : "",

    archiveUri:
      typeof value.archiveUri === "string"
        ? value.archiveUri
        : "",

    importedAt:
      typeof value.importedAt === "string"
        ? value.importedAt
        : new Date().toISOString(),

    modifiedAt:
      typeof value.modifiedAt === "string"
        ? value.modifiedAt
        : null,

    tags: Array.isArray(value.tags)
      ? value.tags.filter(
          (tag): tag is string =>
            typeof tag === "string"
        )
      : [],

    category:
      typeof value.category === "string" &&
      value.category
        ? value.category
        : "Other",

    status:
      value.status === "MISSING"
        ? "MISSING"
        : "AVAILABLE",
  };
}

export async function getArchiveFiles(): Promise<ArchiveFile[]> {
  try {
    const raw = await AsyncStorage.getItem(FILES_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed.map((item) =>
      normalizeFile(
        (item ?? {}) as Partial<ArchiveFile> &
          Record<string, unknown>
      )
    );

    // Save normalized records so missing fields
    // won't cause errors in the interface.
    await AsyncStorage.setItem(
      FILES_KEY,
      JSON.stringify(normalized)
    );

    return normalized;
  } catch (error) {
    console.warn(
      "Unable to load archive records:",
      error
    );

    return [];
  }
}

export async function saveArchiveFiles(
  files: ArchiveFile[]
): Promise<void> {
  const normalized = files.map((file) =>
    normalizeFile(
      file as ArchiveFile & Record<string, unknown>
    )
  );

  await AsyncStorage.setItem(
    FILES_KEY,
    JSON.stringify(normalized)
  );
}

export async function addArchiveFiles(
  newFiles: ArchiveFile[]
): Promise<ArchiveFile[]> {
  const existing = await getArchiveFiles();

  const updated = [
    ...newFiles,
    ...existing,
  ];

  await saveArchiveFiles(updated);

  return updated;
}

export async function updateArchiveFile(
  id: string,
  changes: Partial<ArchiveFile>
): Promise<ArchiveFile[]> {
  const files = await getArchiveFiles();

  const updated = files.map((file) =>
    file.id === id
      ? { ...file, ...changes }
      : file
  );

  await saveArchiveFiles(updated);

  return updated;
}

export async function deleteArchiveFile(
  id: string
): Promise<ArchiveFile[]> {
  const files = await getArchiveFiles();

  const updated = files.filter(
    (file) => file.id !== id
  );

  await saveArchiveFiles(updated);

  return updated;
}

async function readStringArray(
  key: string
): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(
        parsed.filter(
          (item): item is string =>
            typeof item === "string"
        )
      )
    );
  } catch {
    return [];
  }
}

export function getTags(): Promise<string[]> {
  return readStringArray(TAGS_KEY);
}

export function getCategories(): Promise<string[]> {
  return readStringArray(CATEGORIES_KEY);
}

export async function saveTags(
  tags: string[]
): Promise<void> {
  const normalized = Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

  await AsyncStorage.setItem(
    TAGS_KEY,
    JSON.stringify(normalized)
  );
}

export async function saveCategories(
  categories: string[]
): Promise<void> {
  const normalized = Array.from(
    new Set(
      categories
        .map((category) => category.trim())
        .filter(Boolean)
    )
  );

  await AsyncStorage.setItem(
    CATEGORIES_KEY,
    JSON.stringify(normalized)
  );
}

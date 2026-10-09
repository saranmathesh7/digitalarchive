import type { DocumentPickerAsset } from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Linking, Platform } from "react-native";
import {
  ArchiveFile,
  getArchiveFiles,
  saveArchiveFiles,
} from "../storage";

const ARCHIVE_FOLDER = "digital-archive";

function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "file";
}

function getCategory(mimeType: string, name: string): string {
  const mime = mimeType.toLowerCase();
  const lowerName = name.toLowerCase();
  if (mime.startsWith("image/")) return "Images";
  if (mime === "application/pdf" || lowerName.endsWith(".pdf")) return "PDF";
  if (mime.includes("word") || mime.includes("document") || mime.startsWith("text/") ||
      /\.(doc|docx|txt|rtf|odt)$/.test(lowerName)) return "Documents";
  if (mime.includes("sheet") || mime.includes("excel") || /\.(xls|xlsx|csv|ods)$/.test(lowerName)) return "Spreadsheets";
  if (mime.includes("presentation") || mime.includes("powerpoint") || /\.(ppt|pptx|odp)$/.test(lowerName)) return "Presentations";
  if (mime.startsWith("video/")) return "Videos";
  if (mime.startsWith("audio/")) return "Audio";
  return "Other";
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureArchiveDirectory(): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error("The app's document storage is unavailable.");
  const directory = `${root}${ARCHIVE_FOLDER}/`;
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  return directory;
}

export async function importAsset(asset: DocumentPickerAsset): Promise<ArchiveFile> {
  const id = makeId();
  const mime = asset.mimeType || "application/octet-stream";
  const importedAt = new Date().toISOString();
  let archiveUri = asset.uri;

  if (Platform.OS !== "web") {
    const directory = await ensureArchiveDirectory();
    const storedName = `${id}_${safeName(asset.name)}`;
    archiveUri = `${directory}${storedName}`;

    // copyAsync rejects on copy failure, so no database record is created for a failed copy.
    await FileSystem.copyAsync({ from: asset.uri, to: archiveUri });

    const copiedInfo = await FileSystem.getInfoAsync(archiveUri);
    if (!copiedInfo.exists || copiedInfo.isDirectory) {
      throw new Error(`Could not verify copied file: ${asset.name}`);
    }
  }

  return {
    id,
    name: asset.name || "Untitled file",
    originalName: asset.name || "Untitled file",
    type: mime,
    size: typeof asset.size === "number" ? asset.size : 0,
    originalUri: asset.uri,
    archiveUri,
    importedAt,
    modifiedAt:
      typeof asset.lastModified === "number"
        ? new Date(asset.lastModified).toISOString()
        : null,
    tags: [],
    category: getCategory(mime, asset.name || ""),
    status: "AVAILABLE",
  };
}

export async function checkAvailability(file: ArchiveFile): Promise<"AVAILABLE" | "MISSING"> {
  try {
    if (!file.archiveUri) return "MISSING";
    if (Platform.OS === "web") {
      // Web picker URIs may be temporary object URLs; they cannot be reliably inspected by FileSystem.
      return file.archiveUri ? "AVAILABLE" : "MISSING";
    }
    const info = await FileSystem.getInfoAsync(file.archiveUri);
    return info.exists && !info.isDirectory ? "AVAILABLE" : "MISSING";
  } catch {
    return "MISSING";
  }
}

export async function scanArchive(): Promise<ArchiveFile[]> {
  const files = await getArchiveFiles();
  const checked = await Promise.all(
    files.map(async (file) => ({ ...file, status: await checkAvailability(file) }))
  );
  await saveArchiveFiles(checked);
  return checked;
}

export async function openArchiveFile(file: ArchiveFile): Promise<void> {
  const status = await checkAvailability(file);
  if (status === "MISSING") throw new Error("This file is missing or unavailable.");

  if (Platform.OS === "web") {
    // Browser object URLs may stop working after a page reload.
    if (typeof window !== "undefined") window.open(file.archiveUri, "_blank", "noopener,noreferrer");
    return;
  }

  const contentUri = await FileSystem.getContentUriAsync(file.archiveUri);
  await Linking.openURL(contentUri);
}

export async function removeArchiveEntry(file: ArchiveFile): Promise<ArchiveFile[]> {
  // Deliberately removes only the metadata record, not the physical file.
  const files = await getArchiveFiles();
  const updated = files.filter((item) => item.id !== file.id);
  await saveArchiveFiles(updated);
  return updated;
}

export function showMessage(title: string, message: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

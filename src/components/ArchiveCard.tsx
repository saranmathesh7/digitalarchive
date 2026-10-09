import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ArchiveFile } from "../storage";

const PURPLE = "#7C3AED";
const MUTED = "#817C91";
const BORDER = "#E9E5F0";

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileBadge(file: ArchiveFile): string {
  if (file.type.startsWith("image/")) return "IMG";
  if (file.type === "application/pdf") return "PDF";
  if (file.category === "Spreadsheets") return "XLS";
  if (file.category === "Presentations") return "PPT";
  return "DOC";
}

export default function ArchiveCard({
  file,
  onPress,
}: {
  file: ArchiveFile;
  onPress: () => void;
}) {
  const tags = Array.isArray(file.tags) ? file.tags : [];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{fileBadge(file)}</Text>
      </View>
      <View style={styles.info}>
        <Text numberOfLines={1} style={styles.name}>{file.name || file.originalName || "Untitled file"}</Text>
        <Text style={styles.meta}>{formatSize(file.size || 0)} · {file.category || "Other"}</Text>
        <View style={styles.tags}>
          {tags.slice(0, 2).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
        </View>
      </View>
      <View style={styles.statusWrap}>
        <View style={[styles.dot, file.status === "MISSING" && styles.missingDot]} />
        <Text style={[styles.status, file.status === "MISSING" && styles.missingText]}>
          {file.status === "MISSING" ? "MISSING" : "AVAILABLE"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 17, borderWidth: 1, borderColor: BORDER, padding: 12, flexDirection: "row", alignItems: "center", marginBottom: 9 },
  badge: { width: 47, height: 52, borderRadius: 13, backgroundColor: "#F0EAFF", alignItems: "center", justifyContent: "center", marginRight: 12 },
  badgeText: { color: PURPLE, fontSize: 9, fontWeight: "900" },
  info: { flex: 1, minWidth: 0 },
  name: { color: "#262238", fontSize: 13, fontWeight: "800" },
  meta: { color: MUTED, fontSize: 10, marginTop: 4 },
  tags: { flexDirection: "row", gap: 5, marginTop: 5 },
  tag: { color: PURPLE, fontSize: 9, fontWeight: "800" },
  statusWrap: { alignItems: "flex-end", marginLeft: 6 },
  dot: { width: 7, height: 7, borderRadius: 5, backgroundColor: "#22C55E", marginBottom: 4 },
  missingDot: { backgroundColor: "#EF4444" },
  status: { color: "#16A34A", fontSize: 7, fontWeight: "900" },
  missingText: { color: "#EF4444" },
});

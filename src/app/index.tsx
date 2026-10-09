import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, Platform, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import ArchiveCard from "../components/ArchiveCard";
import { importAsset, openArchiveFile, scanArchive, showMessage } from "../services/archiveService";
import {
  ArchiveFile, addArchiveFiles, deleteArchiveFile, getArchiveFiles,
  getCategories, getTags, saveCategories, saveTags, updateArchiveFile,
} from "../storage";

type Screen = "HOME" | "AI" | "INSIGHTS" | "PROFILE";
type Filter = "ALL" | "PDF" | "IMAGE" | "DOCUMENT" | "OTHER";

const PURPLE = "#7C3AED";
const DARK = "#151326";
const TEXT = "#262238";
const MUTED = "#817C91";
const BG = "#F7F5FC";
const BORDER = "#E9E5F0";
const RED = "#EF4444";

function notify(title: string, message: string) {
  if (Platform.OS === "web") showMessage(title, message);
  else Alert.alert(title, message);
}

export default function HomeScreen() {
  const [screen, setScreen] = useState<Screen>("HOME");
  const [files, setFiles] = useState<ArchiveFile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selectedFile, setSelectedFile] = useState<ArchiveFile | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [tagVisible, setTagVisible] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [scanning, setScanning] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [savedFiles, savedTags, savedCategories] = await Promise.all([
        getArchiveFiles(), getTags(), getCategories(),
      ]);
      setFiles(savedFiles);
      setTags(savedTags);
      setCategories(savedCategories);
      const checked = await scanArchive();
      setFiles(checked);
    } catch (error) {
      console.warn("Archive load failed:", error);
      notify("Storage warning", "Some archive data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function importFiles() {
    if (importing) return;
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf", "text/*", "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const imported: ArchiveFile[] = [];
      const failed: string[] = [];
      for (const asset of result.assets) {
        try { imported.push(await importAsset(asset)); }
        catch (error) {
          console.warn("Import failed for", asset.name, error);
          failed.push(asset.name || "Unnamed file");
        }
      }

      if (imported.length) {
        try {
          const updated = await addArchiveFiles(imported);
          setFiles(updated);
          const mergedCategories = Array.from(new Set([...categories, ...imported.map((f) => f.category)]));
          await saveCategories(mergedCategories);
          setCategories(mergedCategories);
          notify("Import complete", `${imported.length} file(s) added.${failed.length ? ` ${failed.length} failed.` : ""}`);
        } catch (error) {
          // Metadata persistence failed. Do not pretend the records were saved.
          console.error("Could not save imported records:", error);
          notify("Storage error", "Files may have been copied, but the archive records could not be saved. Please retry.");
        }
      } else if (failed.length) {
        notify("Import failed", `${failed.length} file(s) could not be imported.`);
      }
    } catch (error) {
      console.error("Document picker failed:", error);
      notify("Import error", "Unable to import the selected files.");
    } finally {
      setImporting(false);
    }
  }

  async function refreshScan() {
    setScanning(true);
    try { setFiles(await scanArchive()); }
    catch { notify("Scan error", "The archive could not be scanned."); }
    finally { setScanning(false); }
  }

  const available = files.filter((f) => f.status === "AVAILABLE").length;
  const missing = files.filter((f) => f.status === "MISSING").length;
  const pdfCount = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")).length;
  const imageCount = files.filter((f) => f.type.startsWith("image/")).length;
  const documentCount = files.filter((f) => f.category === "Documents").length;

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((file) => {
      const fileTags = Array.isArray(file.tags) ? file.tags : [];
      const matchesQuery = !q || file.name.toLowerCase().includes(q) ||
        file.category.toLowerCase().includes(q) || fileTags.some((tag) => tag.toLowerCase().includes(q));
      let matchesFilter = true;
      if (filter === "PDF") matchesFilter = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (filter === "IMAGE") matchesFilter = file.type.startsWith("image/");
      if (filter === "DOCUMENT") matchesFilter = file.category === "Documents";
      if (filter === "OTHER") matchesFilter = !["PDF", "Images", "Documents"].includes(file.category);
      return matchesQuery && matchesFilter;
    });
  }, [files, search, filter]);

  const aiResults = useMemo(() => {
    const q = aiQuery.trim().toLowerCase();
    if (!q) return [];
    return files.filter((file) => {
      const fileTags = Array.isArray(file.tags) ? file.tags : [];
      return file.name.toLowerCase().includes(q) || file.category.toLowerCase().includes(q) ||
        fileTags.some((tag) => tag.toLowerCase().includes(q));
    });
  }, [files, aiQuery]);

  function openDetails(file: ArchiveFile) {
    setSelectedFile(file);
    setNameValue(file.name);
    setEditingName(false);
    setDetailsVisible(true);
  }

  async function renameFile() {
    if (!selectedFile || !nameValue.trim()) return;
    const updated = await updateArchiveFile(selectedFile.id, { name: nameValue.trim() });
    setFiles(updated);
    setSelectedFile(updated.find((f) => f.id === selectedFile.id) ?? null);
    setEditingName(false);
  }

  async function addTag() {
    if (!selectedFile || !newTag.trim()) return;
    const tag = newTag.trim().replace(/^#/, "");
    const updatedTagsForFile = Array.from(new Set([...(selectedFile.tags ?? []), tag]));
    const updated = await updateArchiveFile(selectedFile.id, { tags: updatedTagsForFile });
    const changed = updated.find((f) => f.id === selectedFile.id) ?? null;
    setFiles(updated);
    setSelectedFile(changed);
    const allTags = Array.from(new Set([...tags, tag]));
    await saveTags(allTags);
    setTags(allTags);
    setNewTag("");
    setTagVisible(false);
  }

  async function removeTag(tag: string) {
    if (!selectedFile) return;
    const updated = await updateArchiveFile(selectedFile.id, { tags: (selectedFile.tags ?? []).filter((t) => t !== tag) });
    setFiles(updated);
    setSelectedFile(updated.find((f) => f.id === selectedFile.id) ?? null);
  }

  function removeEntry() {
    if (!selectedFile) return;
    const proceed = async () => {
      const updated = await deleteArchiveFile(selectedFile.id);
      setFiles(updated);
      setSelectedFile(null);
      setDetailsVisible(false);
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Remove this archive record? The physical file will not be deleted.")) void proceed();
    } else {
      Alert.alert("Remove archive entry?", "The archive record will be removed. The physical file will not be deleted.", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void proceed() },
      ]);
    }
  }

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={PURPLE} /><Text style={styles.muted}>Preparing your archive…</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {screen === "HOME" && <>
          <View style={styles.header}>
            <View><Text style={styles.eyebrow}>PERSONAL AI ARCHIVE</Text><Text style={styles.headerTitle}>Digital Archive</Text><Text style={styles.muted}>Your files. Smarter.</Text></View>
            <TouchableOpacity style={styles.avatar} onPress={() => setScreen("PROFILE")}><Text style={styles.avatarText}>DA</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.askCard} onPress={() => setScreen("AI")}>
            <Text style={styles.askEyebrow}>✦ AI ASSISTANT</Text><Text style={styles.askTitle}>Ask your archive</Text>
            <Text style={styles.askSub}>Find documents, projects, notes and more.</Text>
            <View style={styles.fakeSearch}><Text style={styles.fakeSearchText}>Ask anything about your files…</Text><Text style={styles.arrow}>→</Text></View>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>AI Insights</Text>
          <View style={styles.statsGrid}>
            <Stat title="Total Files" value={files.length} sub="In your archive" />
            <Stat title="Available" value={available} sub="Ready to open" />
            <Stat title="Documents" value={documentCount} sub="Document files" />
            <Stat title="Needs Attention" value={missing} sub="Missing files" danger />
          </View>
          <View style={styles.sectionRow}><View><Text style={styles.sectionTitle}>Recent Files</Text><Text style={styles.mutedSmall}>Your latest archive activity</Text></View><TouchableOpacity onPress={() => setScreen("INSIGHTS")}><Text style={styles.link}>View all</Text></TouchableOpacity></View>
          {files.slice(0, 5).length ? files.slice(0, 5).map((file) => <ArchiveCard key={file.id} file={file} onPress={() => openDetails(file)} />) : <View style={styles.empty}><Text style={styles.emptyTitle}>Your archive is ready</Text><Text style={styles.muted}>Import your first files to get started.</Text></View>}
          <TouchableOpacity style={styles.primaryButton} onPress={() => void importFiles()} disabled={importing}>{importing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>＋  Import Files</Text>}</TouchableOpacity>
        </>}

        {screen === "AI" && <>
          <PageHeader title="Ask your archive" subtitle="Search your saved metadata" onBack={() => setScreen("HOME")} />
          <View style={styles.aiHero}><Text style={styles.askEyebrow}>✦ ARCHIVE SEARCH</Text><Text style={styles.askTitle}>What are you looking for?</Text><Text style={styles.askSub}>Search by filename, category or tag.</Text><TextInput value={aiQuery} onChangeText={setAiQuery} placeholder="Try college, PDF, project…" placeholderTextColor="#9E98AB" style={styles.input} /></View>
          {aiQuery.trim() ? <><Text style={styles.sectionTitle}>Search Results ({aiResults.length})</Text>{aiResults.map((file) => <ArchiveCard key={file.id} file={file} onPress={() => openDetails(file)} />)}{!aiResults.length && <Text style={styles.muted}>No matching files found.</Text>}</> : <><Text style={styles.sectionTitle}>Suggested Searches</Text><View style={styles.chips}>{["College", "PDF", "Documents", "Projects", "Images", "Resume"].map((item) => <TouchableOpacity key={item} style={styles.chip} onPress={() => setAiQuery(item)}><Text style={styles.link}>{item}</Text></TouchableOpacity>)}</View></>}
        </>}

        {screen === "INSIGHTS" && <>
          <PageHeader title="Archive Insights" subtitle="Understand your digital archive" onBack={() => setScreen("HOME")} />
          <View style={styles.bigStat}><Text style={styles.bigStatNumber}>{files.length}</Text><Text style={styles.bigStatTitle}>files archived</Text><Text style={styles.askSub}>{available} available · {missing} missing</Text></View>
          <Text style={styles.sectionTitle}>Find Files</Text>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search filenames, categories, tags…" placeholderTextColor="#9E98AB" style={styles.input} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["ALL", "PDF", "IMAGE", "DOCUMENT", "OTHER"] as Filter[]).map((value) => <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.chip, filter === value && styles.chipActive]}><Text style={[styles.chipText, filter === value && styles.chipTextActive]}>{value}</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.mutedSmall}>{filteredFiles.length} result(s)</Text>
          {filteredFiles.map((file) => <ArchiveCard key={file.id} file={file} onPress={() => openDetails(file)} />)}
          <Text style={styles.sectionTitle}>File Distribution</Text>
          <Distribution label="PDF" count={pdfCount} total={files.length} />
          <Distribution label="Images" count={imageCount} total={files.length} />
          <Distribution label="Documents" count={documentCount} total={files.length} />
          <View style={styles.scanCard}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Archive Integrity</Text><Text style={styles.mutedSmall}>Check whether imported files are still accessible.</Text></View><TouchableOpacity style={styles.scanButton} onPress={() => void refreshScan()}>{scanning ? <ActivityIndicator color={PURPLE} /> : <Text style={styles.link}>Scan</Text>}</TouchableOpacity></View>
        </>}

        {screen === "PROFILE" && <>
          <PageHeader title="Your Archive" subtitle="Personal file space" onBack={() => setScreen("HOME")} />
          <View style={styles.profileCard}><View style={styles.profileIcon}><Text style={styles.avatarText}>DA</Text></View><Text style={styles.profileTitle}>Digital Archive</Text><Text style={styles.askSub}>Local-first personal file management</Text></View>
          <View style={styles.infoCard}><InfoRow label="Files" value={String(files.length)} /><InfoRow label="Categories" value={String(categories.length)} /><InfoRow label="Tags" value={String(tags.length)} /><InfoRow label="Available" value={String(available)} /></View>
          <Text style={styles.muted}>Archive entries are stored locally. Removing an entry does not delete the physical file.</Text>
        </>}
      </ScrollView>

      <View style={styles.bottomNav}>
        <NavItem label="Home" icon="⌂" active={screen === "HOME"} onPress={() => setScreen("HOME")} />
        <NavItem label="AI Search" icon="✦" active={screen === "AI"} onPress={() => setScreen("AI")} />
        <TouchableOpacity style={styles.floatingAdd} onPress={() => void importFiles()}><Text style={styles.floatingAddText}>+</Text></TouchableOpacity>
        <NavItem label="Insights" icon="◫" active={screen === "INSIGHTS"} onPress={() => setScreen("INSIGHTS")} />
        <NavItem label="Profile" icon="○" active={screen === "PROFILE"} onPress={() => setScreen("PROFILE")} />
      </View>

      <Modal visible={detailsVisible} animationType="slide" transparent onRequestClose={() => setDetailsVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modal}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>File Details</Text><TouchableOpacity onPress={() => setDetailsVisible(false)}><Text style={styles.close}>×</Text></TouchableOpacity></View>
          {selectedFile && <ScrollView>
            {selectedFile.type.startsWith("image/") && <Image source={{ uri: selectedFile.archiveUri }} style={styles.preview} resizeMode="contain" />}
            {editingName ? <View style={styles.renameRow}><TextInput value={nameValue} onChangeText={setNameValue} style={[styles.input, { flex: 1 }]} /><TouchableOpacity style={styles.smallPrimary} onPress={() => void renameFile()}><Text style={styles.primaryButtonText}>Save</Text></TouchableOpacity></View> : <View style={styles.sectionRow}><Text style={styles.detailName}>{selectedFile.name}</Text><TouchableOpacity onPress={() => setEditingName(true)}><Text style={styles.link}>Edit</Text></TouchableOpacity></View>}
            <Detail label="Type" value={selectedFile.type} /><Detail label="Size" value={`${(selectedFile.size / 1024).toFixed(1)} KB`} /><Detail label="Category" value={selectedFile.category} /><Detail label="Status" value={selectedFile.status} /><Detail label="Imported" value={new Date(selectedFile.importedAt).toLocaleString()} /><Detail label="Last modified" value={selectedFile.modifiedAt ? new Date(selectedFile.modifiedAt).toLocaleString() : "Unknown"} />
            <Text style={styles.sectionTitle}>Tags</Text><View style={styles.chips}>{(selectedFile.tags ?? []).map((tag) => <TouchableOpacity key={tag} style={styles.chip} onPress={() => void removeTag(tag)}><Text style={styles.link}>#{tag} ×</Text></TouchableOpacity>)}<TouchableOpacity style={styles.chip} onPress={() => setTagVisible(true)}><Text style={styles.link}>+ Add Tag</Text></TouchableOpacity></View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => { void openArchiveFile(selectedFile).catch((error) => notify("Unable to open", error instanceof Error ? error.message : "File unavailable.")); }}><Text style={styles.primaryButtonText}>Open File</Text></TouchableOpacity>
            <TouchableOpacity style={styles.removeButton} onPress={removeEntry}><Text style={styles.removeText}>Remove Archive Entry</Text></TouchableOpacity>
          </ScrollView>}
        </View></View>
      </Modal>

      <Modal visible={tagVisible} transparent animationType="fade" onRequestClose={() => setTagVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.tagModal}><Text style={styles.modalTitle}>Add Tag</Text><TextInput value={newTag} onChangeText={setNewTag} placeholder="e.g. college" placeholderTextColor="#9E98AB" style={styles.input} autoFocus /><View style={styles.sectionRow}><TouchableOpacity onPress={() => setTagVisible(false)}><Text style={styles.muted}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.smallPrimary} onPress={() => void addTag()}><Text style={styles.primaryButtonText}>Add</Text></TouchableOpacity></View></View></View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ title, value, sub, danger }: { title: string; value: number; sub: string; danger?: boolean }) {
  return <View style={styles.stat}><Text style={[styles.statValue, danger && { color: RED }]}>{value}</Text><Text style={styles.cardTitle}>{title}</Text><Text style={styles.mutedSmall}>{sub}</Text></View>;
}
function PageHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <View style={styles.pageHeader}><TouchableOpacity style={styles.backButton} onPress={onBack}><Text style={styles.backText}>←</Text></TouchableOpacity><View style={{ flex: 1 }}><Text style={styles.pageTitle}>{title}</Text><Text style={styles.mutedSmall}>{subtitle}</Text></View></View>;
}
function Distribution({ label, count, total }: { label: string; count: number; total: number }) {
  const percentage = total ? Math.round((count / total) * 100) : 0;
  return <View style={styles.distribution}><View style={styles.sectionRow}><Text style={styles.cardTitle}>{label}</Text><Text style={styles.mutedSmall}>{count}</Text></View><View style={styles.track}><View style={[styles.progress, { width: `${percentage}%` }]} /></View></View>;
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.muted}>{label}</Text><Text style={styles.cardTitle}>{value}</Text></View>;
}
function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}
function NavItem({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity style={styles.navItem} onPress={onPress}><Text style={[styles.navIcon, active && { color: PURPLE }]}>{icon}</Text><Text style={[styles.navLabel, active && { color: PURPLE }]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  content: { padding: 20, paddingBottom: 115, maxWidth: 760, width: "100%", alignSelf: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BG },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  eyebrow: { color: PURPLE, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginBottom: 6 },
  headerTitle: { color: DARK, fontSize: 29, fontWeight: "900" },
  muted: { color: MUTED, fontSize: 12, marginTop: 4 },
  mutedSmall: { color: MUTED, fontSize: 10, marginTop: 3 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: DARK, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  askCard: { backgroundColor: DARK, borderRadius: 25, padding: 21, marginBottom: 25 },
  askEyebrow: { color: "#B9A4FF", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  askTitle: { color: "#FFFFFF", fontSize: 23, fontWeight: "900", marginTop: 8 },
  askSub: { color: "#B8B3C8", fontSize: 12, marginTop: 5, marginBottom: 15 },
  fakeSearch: { minHeight: 48, backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13 },
  fakeSearchText: { color: "#C0BBCB", fontSize: 12, flex: 1 },
  arrow: { color: "#FFFFFF", backgroundColor: PURPLE, borderRadius: 10, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 5, fontWeight: "900" },
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 10, marginTop: 5 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 25 },
  stat: { width: "48%", flexGrow: 1, backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 15 },
  statValue: { color: TEXT, fontSize: 23, fontWeight: "900" },
  cardTitle: { color: TEXT, fontSize: 12, fontWeight: "800", marginTop: 2 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginVertical: 8 },
  link: { color: PURPLE, fontSize: 11, fontWeight: "900" },
  empty: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: BORDER, alignItems: "center", padding: 25 },
  emptyTitle: { color: TEXT, fontSize: 16, fontWeight: "900" },
  primaryButton: { minHeight: 52, borderRadius: 16, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", padding: 14, marginTop: 12 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  bottomNav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 76, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 7 },
  navItem: { width: 62, alignItems: "center" },
  navIcon: { color: "#9B96A7", fontSize: 19, marginBottom: 3 },
  navLabel: { color: "#9B96A7", fontSize: 8, fontWeight: "800" },
  floatingAdd: { width: 49, height: 49, borderRadius: 18, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", marginTop: -24 },
  floatingAddText: { color: "#FFFFFF", fontSize: 27, fontWeight: "300" },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 25 },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  backText: { color: TEXT, fontSize: 20, fontWeight: "800" },
  pageTitle: { color: TEXT, fontSize: 23, fontWeight: "900" },
  aiHero: { backgroundColor: DARK, borderRadius: 25, padding: 22, marginBottom: 25 },
  input: { minHeight: 46, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, color: TEXT, fontSize: 12, marginVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  chip: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  chipActive: { backgroundColor: "#EEE8FF", borderColor: "#D3C4FF" },
  chipText: { color: MUTED, fontSize: 10, fontWeight: "800" },
  chipTextActive: { color: PURPLE },
  bigStat: { backgroundColor: DARK, borderRadius: 24, padding: 25, marginBottom: 25 },
  bigStatNumber: { color: "#FFFFFF", fontSize: 48, fontWeight: "900" },
  bigStatTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  distribution: { marginTop: 12 },
  track: { height: 8, backgroundColor: "#E9E5F0", borderRadius: 5, overflow: "hidden" },
  progress: { height: "100%", backgroundColor: PURPLE, borderRadius: 5 },
  scanCard: { marginTop: 25, backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: BORDER, padding: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scanButton: { backgroundColor: "#F0EAFF", borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10 },
  profileCard: { backgroundColor: DARK, borderRadius: 25, alignItems: "center", padding: 28, marginBottom: 16 },
  profileIcon: { width: 64, height: 64, borderRadius: 21, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center" },
  profileTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", marginTop: 13 },
  infoCard: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 17, marginBottom: 18 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#F1EEF4" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(10,8,18,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 21, maxHeight: "92%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 17 },
  modalTitle: { color: TEXT, fontSize: 20, fontWeight: "900" },
  close: { color: MUTED, fontSize: 28 },
  preview: { width: "100%", height: 170, backgroundColor: BG, borderRadius: 16, marginBottom: 15 },
  detailName: { flex: 1, color: TEXT, fontSize: 18, fontWeight: "900" },
  renameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  smallPrimary: { backgroundColor: PURPLE, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12 },
  detail: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1EEF4" },
  detailLabel: { color: MUTED, fontSize: 9, fontWeight: "900", marginBottom: 4 },
  detailValue: { color: TEXT, fontSize: 11 },
  removeButton: { borderWidth: 1, borderColor: "#F2CACA", borderRadius: 14, alignItems: "center", paddingVertical: 13, marginTop: 9, marginBottom: 25 },
  removeText: { color: RED, fontSize: 11, fontWeight: "900" },
  tagModal: { backgroundColor: "#FFFFFF", borderRadius: 23, padding: 21, marginHorizontal: 20 },
});

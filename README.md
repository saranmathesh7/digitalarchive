
# Digital Archive

A local-first mobile archive built with Expo, React Native, Expo Router, AsyncStorage, and Expo Document Picker.

## Features

- Import multiple images, PDFs, and office/text documents.
- Store archive metadata: display name, original name, MIME type, size, import time, last-modified time, category, tags, URI, and availability status.
- Persist archive records, tags, and categories using AsyncStorage.
- Search by filename, category, and tags; filter by file type.
- Rename archive entries, add/remove tags, open files, and remove archive entries.
- Integrity scan marks unavailable native files as missing.
- Removing an archive entry removes its metadata only; it deliberately does not delete the physical file.
- Older records are normalized to avoid missing `tags`, `category`, or `name` values crashing the UI.

## Setup

Use the existing Expo project created for this task. Copy the files in this bundle into the matching paths under the project's root, replacing existing files when prompted.

Install dependencies from the project root:

```bash
npx expo install expo-document-picker expo-file-system @react-native-async-storage/async-storage
```

Start the app:

```bash
npx expo start -c
```

Press `w` to open web preview, or scan the QR code with Expo Go for a device test.

## Important storage notes

- On native platforms, imported files are copied into the app's persistent document directory before a record is returned.
- The app's metadata is stored in AsyncStorage. For a larger production archive, consider SQLite and a transaction-oriented repository layer.
- On web, document picker URIs can be temporary browser object URLs. Web preview is useful for UI testing but should not be treated as proof of durable file persistence. Validate the Android build for submission.
- The integrity scanner uses native filesystem checks on iOS/Android. Browser object URLs cannot be checked in the same way.
- An import whose file copy fails is not added to the metadata store. If metadata saving fails after a successful native copy, an orphaned copied file may remain and should be handled by a future reconciliation task.

## Test checklist

1. Import at least one image, PDF, and document.
2. Import multiple files together and confirm successful/failed counts.
3. Open each imported file.
4. Rename an archive entry.
5. Add and remove tags.
6. Search by filename, category, and tag; test each type filter.
7. Close and reopen the app; verify records remain.
8. Run Archive Integrity.
9. Remove an archive entry and verify that the app does not intentionally delete its physical file.
10. Build, install, and test an Android APK before submission.

## Android APK

For an EAS cloud build, configure the Expo project with EAS Build, then run:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
```

Create an `eas.json` with a preview profile that produces an APK if the project configuration does not already provide one. Install and test the resulting APK before sharing it.

## Current AI behavior

The “Ask your archive” screen performs local keyword matching against saved filenames, categories, and tags. It is not an LLM-based semantic search service. No API secret is embedded in the mobile client.
=======
# digitalarchive


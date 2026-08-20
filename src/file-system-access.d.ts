/**
 * The parts of the File System Access API this app uses.
 *
 * Declared here rather than pulled in as a dependency: it is a handful of
 * members, and only Chromium implements them, so the app treats them as
 * something that may not be there.
 */
interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>
  requestPermission?(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>
}

interface FileSystemDirectoryHandle {
  /** Everything in the folder, in whatever order the file system gives it. */
  values(): AsyncIterableIterator<FileSystemHandle & { kind: 'file' | 'directory' }>
}

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: string | FileSystemHandle
}

interface Window {
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
}

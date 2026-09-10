/** Application chrome: toolbar, workspace, side panel and status bar. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@/editor/Canvas'
import { useEditorStore } from '@/editor/store'
import { importFile } from '@/io/library'
import { fetchMicrocontroller, openParam, xmlPathFromOpen } from '@/io/openQuery'
import { ComponentPicker } from './ComponentPicker'
import { LuaEditor } from './LuaEditor'
import { MonitorPanel } from './MonitorPanel'
import { PinEditor } from './PinEditor'
import { GameFilesDialog } from './GameFilesDialog'
import { restoreFolders } from './gameFilesStore'
import { AuthDialog } from './AuthDialog'
import { ProjectDialog, type ProjectDialogMode } from './ProjectDialog'
import { PinPanel } from './PinPanel'
import { PropertyPanel } from './PropertyPanel'
import { StatusBar } from './StatusBar'
import { Toolbar } from './Toolbar'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useSimulationDriver } from '@/sim/useSimulationDriver'
import { cloudLibrary } from '@/io/config'
import { logout, me, type Account } from '@/io/auth'
import { installLuaRunner } from '@/lua/runner'

installLuaRunner()
import './shell.css'

export function AppShell() {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dialog, setDialog] = useState<ProjectDialogMode | null>(null)
  const [showTooltips, setShowTooltips] = useState(true)
  const [pinsOpen, setPinsOpen] = useState(false)
  const [gameFilesOpen, setGameFilesOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)

  useEffect(() => {
    if (!cloudLibrary()) return
    void me().then(setAccount, () => setAccount(null))
  }, [])

  // Folders chosen on an earlier visit are picked up quietly
  useEffect(() => {
    void restoreFolders()
  }, [])
  const viewSize = useCallback(() => {
    const box = workspaceRef.current?.getBoundingClientRect()
    return { width: box?.width ?? window.innerWidth, height: box?.height ?? window.innerHeight }
  }, [])

  useKeyboardShortcuts(viewSize)
  useSimulationDriver()

  const editingScript = useEditorStore((s) => s.editingScript)
  const openScript = useEditorStore((s) => s.openScript)
  const monitorPort = useEditorStore((s) => s.monitorPort)
  const watchVideo = useEditorStore((s) => s.watchVideo)

  // Dropping a .xml file anywhere on the workspace opens it
  const load = useEditorStore((s) => s.load)
  const zoomToFit = useEditorStore((s) => s.zoomToFit)

  // `?open=hybrid-car` loads the XML the CLI wrote under microcontrollers/
  useEffect(() => {
    const wanted = openParam(window.location.search)
    if (!wanted) return
    const path = xmlPathFromOpen(wanted)
    if (!path.ok) {
      useEditorStore.setState({ problem: path.error })
      return
    }
    void fetchMicrocontroller(path.value).then((result) => {
      if (!result.ok) {
        useEditorStore.setState({ problem: result.error })
        return
      }
      load(result.value)
      requestAnimationFrame(() => zoomToFit(viewSize()))
    })
  }, [load, zoomToFit, viewSize])

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    const result = await importFile(file)
    if (result.ok) load(result.value)
  }

  return (
    <div className={`shell${showTooltips ? '' : ' no-tooltips'}`}>
      <Toolbar
        onOpenPicker={() => setPickerOpen(true)}
        onOpenPins={() => setPinsOpen((open) => !open)}
        onOpenGameFiles={() => setGameFilesOpen(true)}
        onOpenProjects={() => setDialog('open')}
        onSaveProject={() => setDialog('save')}
        showTooltips={showTooltips}
        onToggleTooltips={() => setShowTooltips((v) => !v)}
      />
      <div
        className="workspace"
        ref={workspaceRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => void onDrop(e)}
      >
        <Canvas showNames={showTooltips} />
        {pinsOpen && <PinEditor onClose={() => setPinsOpen(false)} />}
        <PropertyPanel />
        <PinPanel />
        {monitorPort && <MonitorPanel port={monitorPort} onClose={() => watchVideo(null)} />}
      </div>
      <StatusBar
        onOpenPicker={() => setPickerOpen(true)}
        {...(cloudLibrary()
          ? {
              accountLabel: account?.email ?? 'Sign in',
              onAccount: () => {
                if (account) void logout().then(() => setAccount(null))
                else setAuthOpen(true)
              },
            }
          : {})}
      />
      {pickerOpen && <ComponentPicker onClose={() => setPickerOpen(false)} />}
      {dialog && <ProjectDialog mode={dialog} onClose={() => setDialog(null)} />}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onSignedIn={setAccount} />}
      {gameFilesOpen && <GameFilesDialog onClose={() => setGameFilesOpen(false)} />}
      {editingScript && <LuaEditor node={editingScript} onClose={() => openScript(null)} />}
    </div>
  )
}

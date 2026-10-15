/** Application chrome: toolbar, workspace, side panel and status bar. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@/editor/Canvas'
import { useEditorStore } from '@/editor/store'
import { importFile, loadProject } from '@/io/library'
import {
  clearWantedOpen,
  openMicrocontroller,
  projectParam,
  showProjectInUrl,
  wantedOpen,
} from '@/io/openQuery'
import { ComponentPicker } from './ComponentPicker'
import { LuaEditor } from './LuaEditor'
import { MonitorPanel } from './MonitorPanel'
import { PinEditor } from './PinEditor'
import { GameFilesDialog } from './GameFilesDialog'
import { restoreFolders } from './gameFilesStore'
import { AccountDialog } from './AccountDialog'
import { AuthDialog } from './AuthDialog'
import { HelpDialog } from './HelpDialog'
import { HELP_AGENTS, HELP_PARAM } from './helpGuide'
import { ProjectDialog, type ProjectDialogMode } from './ProjectDialog'
import { PinPanel } from './PinPanel'
import { PropertyPanel } from './PropertyPanel'
import { StatusBar } from './StatusBar'
import { Toolbar } from './Toolbar'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useSimulationDriver } from '@/sim/useSimulationDriver'
import { canSignIn, cloudLibrary } from '@/io/config'
import { finishOidcLogin, logout, me, type Account } from '@/io/auth'
import { oidcCallbackParams } from '@/io/oidc'
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
  // Whether the cloud library has said who is signed in yet
  const [accountKnown, setAccountKnown] = useState(!cloudLibrary())
  const [agentOpen, setAgentOpen] = useState(false)
  // `?help=agents` is a link to the agent guide
  const [helpOpen, setHelpOpenState] = useState(
    () => new URLSearchParams(window.location.search).get(HELP_PARAM) === HELP_AGENTS,
  )
  const setHelpOpen = useCallback((open: boolean) => {
    setHelpOpenState(open)
    const url = new URL(window.location.href)
    if (open) url.searchParams.set(HELP_PARAM, HELP_AGENTS)
    else url.searchParams.delete(HELP_PARAM)
    window.history.replaceState({}, '', url)
  }, [])

  useEffect(() => {
    const cb = oidcCallbackParams(window.location.search)
    if (cb) {
      const clean = `${window.location.pathname}${window.location.hash}`
      if ('error' in cb) {
        useEditorStore.setState({ problem: `sign in: ${cb.error}` })
        window.history.replaceState({}, '', clean)
        return
      }
      void finishOidcLogin(cb.code, cb.state)
        .then(setAccount)
        .catch((error) => useEditorStore.setState({ problem: String(error) }))
        .finally(() => {
          window.history.replaceState({}, '', clean)
          setAccountKnown(true)
        })
      return
    }
    if (!cloudLibrary()) return
    void me()
      .then(setAccount, () => setAccount(null))
      .finally(() => setAccountKnown(true))
  }, [])

  const onAccount = () => {
    if (account) setAgentOpen(true)
    else setAuthOpen(true)
  }

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

  // `?open=hybrid-car` loads that microcontroller: from the signed-in cloud
  // library, where the MCP server saves, else the XML the CLI wrote under
  // microcontrollers/. Waits until the library has said who is signed in.
  const [wanted] = useState(() =>
    projectParam(window.location.search) ? null : wantedOpen(window.location.search),
  )
  const opened = useRef(false)
  useEffect(() => {
    if (!wanted || !accountKnown || opened.current) return
    opened.current = true
    void openMicrocontroller(wanted, { enabled: cloudLibrary(), signedIn: account !== null }).then(
      (result) => {
        if (!result.ok) {
          useEditorStore.setState({ problem: result.error })
          if (result.needsSignIn === true) {
            // Try again once they have signed in
            opened.current = false
            setAuthOpen(true)
          } else {
            clearWantedOpen()
          }
          return
        }
        clearWantedOpen()
        const url = new URL(window.location.href)
        url.searchParams.set('open', wanted)
        window.history.replaceState({}, '', url)
        load(result.value)
        requestAnimationFrame(() => zoomToFit(viewSize()))
      },
    )
  }, [wanted, accountKnown, account, load, zoomToFit, viewSize])

  // `?project=diesel` reopens what was saved to the library, readable Lua and
  // all. Same wait: the library is the cloud or this browser by account.
  const [project] = useState(() => projectParam(window.location.search))
  const projectOpened = useRef(false)
  useEffect(() => {
    if (!project || !accountKnown || projectOpened.current) return
    projectOpened.current = true
    void loadProject(project).then((result) => {
      if (!result.ok) {
        useEditorStore.setState({ problem: result.error })
        return
      }
      load(result.value)
      requestAnimationFrame(() => zoomToFit(viewSize()))
    })
  }, [project, accountKnown, load, zoomToFit, viewSize])

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    const result = await importFile(file)
    if (!result.ok) return
    load(result.value)
    showProjectInUrl(null)
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
        onOpenHelp={() => setHelpOpen(true)}
        {...(canSignIn() ? { accountLabel: account?.email ?? 'Sign in', onAccount } : {})}
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
      <StatusBar onOpenPicker={() => setPickerOpen(true)} />
      {pickerOpen && <ComponentPicker onClose={() => setPickerOpen(false)} />}
      {dialog && (
        <ProjectDialog
          mode={dialog}
          onClose={() => setDialog(null)}
          {...(!account && canSignIn() ? { onSignIn: () => setAuthOpen(true) } : {})}
          account={account}
        />
      )}
      {agentOpen && account && (
        <AccountDialog
          account={account}
          onClose={() => setAgentOpen(false)}
          onOpenHelp={() => {
            setAgentOpen(false)
            setHelpOpen(true)
          }}
          onSignOut={() => {
            setAgentOpen(false)
            void logout().then(() => setAccount(null))
          }}
        />
      )}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onSignedIn={setAccount} />}
      {gameFilesOpen && <GameFilesDialog onClose={() => setGameFilesOpen(false)} />}
      {editingScript && <LuaEditor node={editingScript} onClose={() => openScript(null)} />}
    </div>
  )
}

/** Application chrome: toolbar, workspace, side panel and status bar. */
import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@/editor/Canvas'
import { ComponentPicker } from './ComponentPicker'
import { PropertyPanel } from './PropertyPanel'
import { StatusBar } from './StatusBar'
import { Toolbar } from './Toolbar'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import './shell.css'

export function AppShell() {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [showTooltips, setShowTooltips] = useState(true)
  const [viewSize, setViewSize] = useState({ width: 1280, height: 720 })

  useEffect(() => {
    const element = workspaceRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useKeyboardShortcuts(viewSize)

  return (
    <div className={`shell${showTooltips ? '' : ' no-tooltips'}`}>
      <Toolbar
        onOpenPicker={() => setPickerOpen(true)}
        showTooltips={showTooltips}
        onToggleTooltips={() => setShowTooltips((v) => !v)}
      />
      <div className="workspace" ref={workspaceRef}>
        <Canvas />
        <PropertyPanel />
      </div>
      <StatusBar onOpenPicker={() => setPickerOpen(true)} />
      {pickerOpen && <ComponentPicker onClose={() => setPickerOpen(false)} />}
    </div>
  )
}

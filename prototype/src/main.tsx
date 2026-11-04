// THESIS: An open canvas makes arranging and connecting ideas the primary task.
// OWN-WORLD: Inherit the user's explicit reference whiteboard: quiet grid, floating white
// toolbars, blue selection, generous working area. Independent local editor.
// STORY: Place an idea, edit it, connect it, and keep it locally; expose export clearly.
// FIRST VIEWPORT: board name at top left, tools at left, document actions at right,
// zoom at bottom right. Objects remain the focus. Operate mode.
// FORM: Reference reconstruction; no seed. new-work.md §3 says a user- or brief-pinned
// direction beats the roll. No new visual-world or alternate-composition selection.
// FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
import './polyfills';
import { trackInputModality } from './input-modality';
import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './formats.css';
import './features.css';
import './board-panels.css';
import { AppContext, useBoardApp } from './board-app';
import { CanvasSurface } from './canvas-surface';
import { TopBar } from './top-bar';
import { ToolRail } from './tool-rail';
import { SelectionBars } from './selection-bars';
import { FloatingPanels } from './floating-panels';
import { BoardChrome } from './board-chrome';
import { BoardOverlays } from './board-overlays';
import './dashboard.css';

function App() {
  const app = useBoardApp();
  const { presenting, previewStart } = app;
  return (
    <AppContext.Provider value={app}>
      <main className={`app ${presenting || previewStart ? 'presenting' : ''}`}>
        <CanvasSurface />
        <TopBar />
        <ToolRail />
        <SelectionBars />
        <FloatingPanels />
        <BoardChrome />
        <BoardOverlays />
      </main>
    </AppContext.Provider>
  );
}
trackInputModality();
createRoot(document.getElementById('root')!).render(<App />);

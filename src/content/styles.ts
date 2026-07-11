const STYLE_ID = "watcher-stremio-button-style";

export function injectStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #watcher-stremio-button-row {
      --ys-surface: #f8f8f8; --ys-surface-hover: #efefef; --ys-elevated: #fff; --ys-field: #fff;
      --ys-text: #171717; --ys-text-secondary: #606060; --ys-text-muted: #777;
      --ys-accent: #6750bd; --ys-accent-hover: #5a45ad; --ys-accent-active: #4d399d; --ys-accent-soft: #eeeafd;
      --ys-hover: #f2f2f2; --ys-selected: #f0edfa; --ys-error: #b3261e; --ys-border: #d9d9d9; --ys-border-soft: #e8e8e8;
      --ys-focus: #1a73e8; --ys-radius-sm: 8px; --ys-radius-md: 14px; --ys-shadow: 0 12px 32px rgba(0,0,0,.18);
      --ys-space-1: 4px; --ys-space-2: 8px; --ys-space-3: 12px; --ys-space-4: 16px; --ys-duration: 150ms;
      color: var(--ys-text); display: block; font: 14px/1.4 Roboto, Arial, sans-serif; margin: 8px 0 6px;
      position: relative; width: max-content; z-index: 2200;
    }
    html[dark] #watcher-stremio-button-row {
      --ys-surface: #2b2b2b; --ys-surface-hover: #363636; --ys-elevated: #242424; --ys-field: #1f1f1f;
      --ys-text: #f1f1f1; --ys-text-secondary: #b8b8b8; --ys-text-muted: #9a9a9a;
      --ys-accent: #a994ed; --ys-accent-hover: #b9a8f3; --ys-accent-active: #c7bbf7; --ys-accent-soft: #352e4d;
      --ys-hover: #303030; --ys-selected: #302b43; --ys-error: #ffb4ab; --ys-border: #3f3f3f; --ys-border-soft: #333;
      --ys-focus: #8ab4f8; --ys-shadow: 0 16px 36px rgba(0,0,0,.46);
    }
    #watcher-stremio-button-row button, #watcher-stremio-button-row input { font: inherit; }
    #watcher-open-in-stremio {
      align-items: center; background: var(--ys-surface); border: 1px solid var(--ys-border); border-radius: 10px; color: var(--ys-text);
      cursor: pointer; display: inline-flex; font-weight: 500; min-height: 34px; padding: 0 12px;
      transition: background var(--ys-duration), border-color var(--ys-duration), color var(--ys-duration);
      white-space: nowrap;
    }
    #watcher-open-in-stremio:hover { background: var(--ys-surface-hover); border-color: var(--ys-text-muted); }
    #watcher-open-in-stremio:active { background: var(--ys-hover); }
    .watcher-trigger-label { align-items: center; display: inline-flex; gap: 7px; }
    .watcher-trigger-icon {
      border-bottom: 5px solid transparent; border-left: 7px solid currentColor; border-top: 5px solid transparent;
      display: inline-block; height: 0; opacity: .72; width: 0;
    }
    #watcher-open-in-stremio[data-loading="true"] { cursor: progress; padding-left: 12px; position: relative; }
    #watcher-open-in-stremio[data-loading="true"] .watcher-trigger-icon { opacity: 0; }
    #watcher-open-in-stremio[data-loading="true"]::before {
      animation: watcher-spin .8s linear infinite; border: 2px solid var(--ys-border); border-radius: 50%; border-top-color: var(--ys-accent);
      content: ""; height: 12px; left: 12px; position: absolute; top: 9px; width: 12px;
    }
    #watcher-open-in-stremio[data-loading="true"] .watcher-trigger-label { padding-left: 20px; }
    #watcher-open-in-stremio:disabled {
      color: var(--ys-text-secondary); opacity: 1;
    }
    #watcher-stremio-button-row button:focus-visible, #watcher-stremio-button-row input:focus-visible,
    #watcher-stremio-button-row summary:focus-visible {
      outline: 2px solid var(--ys-focus); outline-offset: 2px;
    }
    #watcher-stremio-panel {
      animation: watcher-panel-in var(--ys-duration) ease-out; background: var(--ys-elevated); border: 1px solid var(--ys-border-soft);
      border-radius: var(--ys-radius-md); box-shadow: var(--ys-shadow); box-sizing: border-box; left: 0; margin-top: var(--ys-space-2);
      max-height: min(560px, calc(100vh - 160px)); overflow: auto; padding: var(--ys-space-4); position: relative;
      width: min(392px, calc(100vw - 32px));
    }
    #watcher-stremio-panel:focus { outline: none; }
    #watcher-stremio-panel h2 { font-size: 15px; font-weight: 600; line-height: 1.35; margin: 0 40px var(--ys-space-2) 0; }
    #watcher-stremio-panel p { color: var(--ys-text-secondary); font-size: 13px; font-weight: 400; margin: 0 0 var(--ys-space-4); }
    #watcher-stremio-panel p[role="alert"] { color: var(--ys-error); }
    .watcher-close-button {
      align-items: center; background: transparent; border: 0; border-radius: var(--ys-radius-sm); color: var(--ys-text-secondary); cursor: pointer;
      display: flex; font-size: 22px !important; height: 32px; justify-content: center; line-height: 1; padding: 0; position: absolute; right: 8px; top: 8px; width: 32px;
    }
    .watcher-close-button:hover { background: var(--ys-hover); color: var(--ys-text); }
    .watcher-featured-candidate { align-items: flex-start; display: grid; gap: var(--ys-space-3); grid-template-columns: 72px minmax(0, 1fr); }
    .watcher-poster {
      align-items: center; aspect-ratio: 2 / 3; background: var(--ys-surface); border: 1px solid var(--ys-border); border-radius: 6px;
      color: var(--ys-text-muted); display: flex; font-size: 11px; justify-content: center; overflow: hidden; position: relative; width: 100%;
    }
    .watcher-poster img { height: 100%; inset: 0; object-fit: cover; opacity: 0; position: absolute; transition: opacity var(--ys-duration); width: 100%; }
    .watcher-poster.has-image img { opacity: 1; }
    .watcher-candidate-details { display: flex; flex-direction: column; min-width: 0; }
    .watcher-candidate-details strong { font-size: 15px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
    .watcher-candidate-metadata { color: var(--ys-text-secondary); font-size: 13px; margin-top: 2px; }
    .watcher-match-reason { color: var(--ys-text-muted); font-size: 12px; margin-top: var(--ys-space-2); }
    .watcher-primary-action {
      background: var(--ys-accent); border: 1px solid var(--ys-accent); border-radius: var(--ys-radius-sm); color: #fff; cursor: pointer;
      font-weight: 600 !important; margin-top: var(--ys-space-3); min-height: 38px; padding: 0 12px; width: 100%;
    }
    html[dark] .watcher-primary-action { color: #17131f; }
    .watcher-primary-action:hover { background: var(--ys-accent-hover); border-color: var(--ys-accent-hover); }
    .watcher-primary-action:active { background: var(--ys-accent-active); border-color: var(--ys-accent-active); }
    .watcher-primary-action:disabled { cursor: not-allowed; opacity: .58; }
    .watcher-candidate-list { display: flex; flex-direction: column; gap: var(--ys-space-1); }
    .watcher-candidate {
      align-items: center; background: transparent; border: 1px solid transparent; border-radius: var(--ys-radius-sm); color: var(--ys-text);
      cursor: pointer; display: grid; gap: var(--ys-space-3); grid-template-columns: 42px minmax(0, 1fr); min-height: 70px;
      padding: 6px 68px 6px 6px; position: relative; text-align: left; width: 100%;
    }
    .watcher-candidate:hover { background: var(--ys-hover); }
    .watcher-candidate[aria-pressed="true"] { background: var(--ys-selected); border-color: var(--ys-accent); }
    .watcher-candidate[aria-pressed="true"]::after { bottom: 8px; color: var(--ys-accent); content: "Selected"; font-size: 11px; position: absolute; right: 8px; }
    .watcher-candidate .watcher-candidate-details { grid-column: 2; grid-row: 1; }
    .watcher-secondary-action {
      background: transparent; border: 0; border-radius: var(--ys-radius-sm); color: var(--ys-text-secondary);
      cursor: pointer; display: block; font-weight: 500; margin: var(--ys-space-3) auto 0; min-height: 32px; padding: 0 10px;
    }
    .watcher-secondary-action:hover { background: var(--ys-hover); color: var(--ys-text); }
    .watcher-manual-search-container { margin-top: var(--ys-space-4); }
    .watcher-manual-search-container summary { color: var(--ys-text-secondary); cursor: pointer; font-size: 13px; width: max-content; }
    .watcher-manual-search { display: flex; flex-direction: column; gap: var(--ys-space-3); margin-top: var(--ys-space-2); }
    .watcher-manual-search input {
      background: var(--ys-field); border: 1px solid var(--ys-border); border-radius: var(--ys-radius-sm); box-sizing: border-box;
      color: var(--ys-text); min-height: 38px; min-width: 0; overflow: hidden; padding: 8px 10px; text-overflow: ellipsis; width: 100%;
    }
    .watcher-manual-search input:focus { text-overflow: clip; }
    .watcher-manual-search .watcher-primary-action { margin-top: 0; }
    .watcher-loading-layout { align-items: center; display: grid; gap: var(--ys-space-3); grid-template-columns: 60px 1fr; }
    .watcher-loading-poster { aspect-ratio: 2 / 3; background: var(--ys-surface); border-radius: 6px; width: 60px; }
    .watcher-loading-copy p { margin: 0 !important; }
    @keyframes watcher-spin { to { transform: rotate(360deg); } }
    @keyframes watcher-panel-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) {
      #watcher-stremio-panel, #watcher-open-in-stremio[data-loading="true"]::before, .watcher-poster img { animation: none; transition: none; }
    }
  `;
  doc.head.append(style);
}

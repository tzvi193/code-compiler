document.addEventListener('DOMContentLoaded', () => {
    // --- STATE & CONSTANTS ---
    const APP_STORAGE_KEY = 'webCodeEditorState';
    const state = {
        isSplitView: false,
        autoUpdate: true,
        activeLeftTab: 'html',
        activeRightTab: 'preview',
        lastVSplit: '50%', // Remember vertical split position
        lastHSplit: '200px', // Remember console height
    };

    const files = {
        html: { name: 'HTML', language: 'html', model: null, defaultValue: `<h1>Hello, World!</h1>\n<p>Edit this content to see live updates.</p>\n<button onclick="testLog()">Log to Console</button>` },
        css: { name: 'CSS', language: 'css', model: null, defaultValue: `body {\n  font-family: sans-serif;\n  color: #333;\n  background-color: #f4f4f4;\n  padding: 20px;\n}` },
        js:  { name: 'JavaScript', language: 'javascript', model: null, defaultValue: `// Your JavaScript code here\nconsole.log('Hello from the editor!');\n\nfunction testLog() {\n  console.log("Button was clicked!");\n  console.warn("This is a warning.");\n  console.error("This is an error.");\n}` },
        preview: { name: 'Preview', language: null, model: null },
    };

    // --- DOM ELEMENTS ---
    const mainContainer = document.getElementById('main-container');
    const editorAreaWrapper = document.getElementById('editor-area-wrapper');
    const splitViewBtn = document.getElementById('split-view-btn');
    const previewNewTabBtn = document.getElementById('preview-new-tab-btn');
    const runBtn = document.getElementById('run-btn');
    const autoUpdateCheckbox = document.getElementById('auto-update-checkbox');
    const resizerV = document.getElementById('resizer-v');
    const resizerH = document.getElementById('resizer-h');
    const consoleContainer = document.getElementById('console-container');
    const consoleOutput = document.getElementById('console-output');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    const previewIframes = document.querySelectorAll('.preview-iframe');
    const panes = {
        left:  { el: document.getElementById('pane-left'),  tabBar: document.getElementById('tab-bar-left'),  editorEl: document.getElementById('editor-left'),  previewEl: document.getElementById('preview-left'),  editor: null },
        right: { el: document.getElementById('pane-right'), tabBar: document.getElementById('tab-bar-right'), editorEl: document.getElementById('editor-right'), previewEl: document.getElementById('preview-right'), editor: null }
    };

    // --- UTILITY FUNCTIONS ---
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // --- STATE MANAGEMENT (localStorage) ---
    function saveState() {
        const stateToSave = {
            ...state,
            html: files.html.model.getValue(),
            css: files.css.model.getValue(),
            js: files.js.model.getValue(),
        };
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(stateToSave));
    }

    function loadState() {
        const savedState = JSON.parse(localStorage.getItem(APP_STORAGE_KEY));
        if (!savedState) return;

        // Load content
        files.html.defaultValue = savedState.html || files.html.defaultValue;
        files.css.defaultValue = savedState.css || files.css.defaultValue;
        files.js.defaultValue = savedState.js || files.js.defaultValue;

        // Load UI state
        Object.assign(state, savedState);
        autoUpdateCheckbox.checked = state.autoUpdate;
    }

    // --- MONACO EDITOR INITIALIZATION ---
    loadState(); // Load state before initializing editors
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
        const debouncedSaveAndUpdate = debounce(() => {
            if (state.autoUpdate) updateAllPreviews();
            saveState();
        }, 300);

        for (const id in files) {
            if (files[id].language) {
                files[id].model = monaco.editor.createModel(files[id].defaultValue, files[id].language);
                files[id].model.onDidChangeContent(debouncedSaveAndUpdate);
            }
        }
        const commonConfig = { theme: 'vs-dark', automaticLayout: true };
        panes.left.editor  = monaco.editor.create(panes.left.editorEl, commonConfig);
        panes.right.editor = monaco.editor.create(panes.right.editorEl, commonConfig);
        
        // Initial render after editors are ready
        renderUI();
    });

    // --- EVENT LISTENERS ---
    splitViewBtn.addEventListener('click', toggleSplitView);
    previewNewTabBtn.addEventListener('click', openPreviewInNewTab);
    runBtn.addEventListener('click', updateAllPreviews);
    autoUpdateCheckbox.addEventListener('change', (e) => {
        state.autoUpdate = e.target.checked;
        saveState();
    });
    clearConsoleBtn.addEventListener('click', () => consoleOutput.innerHTML = '');

    panes.left.tabBar.addEventListener('click', e => handleTabClick(e, 'left'));
    panes.right.tabBar.addEventListener('click', e => handleTabClick(e, 'right'));
    
    resizerV.addEventListener('mousedown', startResizeV);
    resizerH.addEventListener('mousedown', startResizeH);

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            updateAllPreviews();
        }
    });

    // --- RESIZER LOGIC ---

    // ✅ CORRECTED Resizer Logic
    function startResizeV(e) {
        e.preventDefault();
        document.body.classList.add('is-resizing-v');
        const startX = e.clientX;
        const startLeftWidth = panes.left.el.getBoundingClientRect().width;
        const totalWidth = mainContainer.getBoundingClientRect().width;

        function onMove(ev) {
            const delta = ev.clientX - startX;
            let newLeftWidth = startLeftWidth + delta;
            
            // Enforce minimum pane widths
            const minWidth = 150;
            newLeftWidth = Math.max(minWidth, Math.min(newLeftWidth, totalWidth - minWidth - resizerV.offsetWidth));
            
            const newRightWidth = totalWidth - newLeftWidth - resizerV.offsetWidth;

            // Set widths in pixels for direct control during drag
            panes.left.el.style.flexBasis = `${newLeftWidth}px`;
            panes.right.el.style.flexBasis = `${newRightWidth}px`;
        }

        function onUp() {
            document.body.classList.remove('is-resizing-v');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            
            // Convert the final pixel width to a percentage for responsive storage
            const finalLeftWidth = panes.left.el.getBoundingClientRect().width;
            const finalTotalWidth = mainContainer.getBoundingClientRect().width;
            state.lastVSplit = `${(finalLeftWidth / finalTotalWidth) * 100}%`;
            saveState();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
    
    function startResizeH(e) {
        e.preventDefault();
        document.body.classList.add('is-resizing-h');
        const startY = e.clientY;
        const startHeight = consoleContainer.getBoundingClientRect().height;
        const totalHeight = editorAreaWrapper.getBoundingClientRect().height;

        function onMove(ev) {
            const delta = startY - ev.clientY;
            let newHeight = startHeight + delta;
            newHeight = Math.max(45, Math.min(newHeight, totalHeight - 100));
            consoleContainer.style.height = newHeight + 'px';
        }

        function onUp() {
            document.body.classList.remove('is-resizing-h');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            state.lastHSplit = consoleContainer.style.height;
            saveState();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // --- CORE UI LOGIC ---
    function toggleSplitView() {
        state.isSplitView = !state.isSplitView;
        renderUI();
    }

    function handleTabClick(event, pane) {
        const tabId = event.target.dataset.tabId;
        if (!tabId) return;

        if (pane === 'left') state.activeLeftTab = tabId;
        else state.activeRightTab = tabId;

        renderUI();
    }

    function renderUI() {
        // Apply saved layout dimensions
        mainContainer.classList.toggle('split-view', state.isSplitView);
        if (state.isSplitView) {
            panes.left.el.style.flexBasis = state.lastVSplit;
            panes.right.el.style.flexBasis = `calc(100% - ${state.lastVSplit})`;
        } else {
            panes.left.el.style.flexBasis = '100%';
            panes.right.el.style.flexBasis = '0%';
        }
        consoleContainer.style.height = state.lastHSplit;

        // Render panes and tab bars
        renderPane('left',  state.activeLeftTab);
        renderPane('right', state.activeRightTab);
        renderTabBar(panes.left.tabBar,  state.activeLeftTab);
        renderTabBar(panes.right.tabBar, state.activeRightTab);
        
        if (state.autoUpdate) {
            updateAllPreviews();
        }
        saveState();
    }

    function renderPane(pane, activeTabId) {
        const ui = panes[pane];
        const file = files[activeTabId];
        if (file.language) {
            ui.previewEl.style.display = 'none';
            ui.editorEl.style.display  = 'block';
            if (ui.editor && ui.editor.getModel() !== file.model) {
                ui.editor.setModel(file.model);
            }
            // Give focus to the editor when its tab is clicked
            setTimeout(() => ui.editor?.focus(), 50);
        } else {
            ui.editorEl.style.display  = 'none';
            ui.previewEl.style.display = 'block';
        }
    }

    function renderTabBar(container, activeId) {
        container.innerHTML = '';
        for (const id in files) {
            const tab = document.createElement('div');
            tab.className = 'tab' + (id === activeId ? ' active' : '');
            tab.dataset.tabId = id;
            tab.textContent = files[id].name;
            container.appendChild(tab);
        }
    }

    // --- PREVIEW & CONSOLE LOGIC ---
    function generatePreviewContent() {
        const html = files.html.model.getValue();
        const css  = files.css.model.getValue();
        const js   = files.js.model.getValue();

        const consoleInterceptor = `
            <script>
                const _log = (type, args) => window.parent.postMessage({ source: 'iframe-console', type, message: Array.from(args).map(arg => JSON.stringify(arg, null, 2)).join(' ') }, '*');
                console.log = (...args) => _log('log', args);
                console.warn = (...args) => _log('warn', args);
                console.error = (...args) => _log('error', args);
                window.addEventListener('error', e => _log('error', [e.message]));
            <\/script>
        `;
        
        return `<!DOCTYPE html><html><head><style>${css}</style>${consoleInterceptor}</head><body>${html}<script>${js}<\/script></body></html>`;
    }
    
    window.addEventListener('message', (event) => {
        if (event.data && event.data.source === 'iframe-console') {
            const { type, message } = event.data;
            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;
            entry.textContent = `[${type}] ${message}`;
            consoleOutput.appendChild(entry);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
    });

    function updateAllPreviews() {
        const content = generatePreviewContent();
        previewIframes.forEach(iframe => {
            iframe.srcdoc = content;
        });
    }

    function openPreviewInNewTab() {
        try {
            const win = window.open();
            win.document.write(generatePreviewContent());
            win.document.close();
        } catch(e) {
            console.error("Could not open new tab. It may have been blocked by a popup blocker.", e);
            alert("Could not open new tab. Please check your popup blocker settings.");
        }
    }
});
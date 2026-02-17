import { hexToRGBA, getShapeBounds, isPointInShape, getShapeCenter } from './js/utils.js';
import { drawPen, resizePen } from './js/tools/pen.js';
import { drawShape as drawShapeInternal, resizeRect, resizeOval, resizeLine } from './js/tools/shapes.js';
import { drawText, drawTextArea, resizeText } from './js/tools/text.js';
import { drawCropOverlay as drawCropOverlayInternal, getCropHandles } from './js/tools/crop.js';
import { drawSelectionHighlight as drawSelectionHighlightInternal, getResizeHandles } from './js/tools/select.js';

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
let img = new Image();
let currentTool = 'select';
let isDrawing = false;
let startX, startY;
let currentColor = '#6366f1';
let currentStrokeOpacity = 1.0;
let currentFillColor = '#6366f1';
let currentFillOpacity = 1.0;
let isFillEnabled = false;
let isStrokeEnabled = true;
let currentThickness = 3;
let shapes = [];
let selectedShape = null;
let cropData = null;
let isResizing = false;
let activeHandle = null;
let dragStartX, dragStartY;
const RESIZE_HANDLE_SIZE = 8;
let currentFontSize = 20;
let currentFontFamily = 'Inter, sans-serif';
let currentBold = false;
let currentItalic = false;
let currentUnderline = false;
let clipboardShape = null;
let history = [];
let historyIndex = -1;
let userManuallyCollapsedSidebar = false;
let cropSelection = null;
let isCropping = false;
let isRotating = false;
let currentSides = 5;
let currentZoom = 1;

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left) * (canvas.width / rect.width),
        y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
}

let typeCounters = {
    line: 0,
    rect: 0,
    circle: 0,
    oval: 0,
    arrow: 0,
    pen: 0,
    text: 0,
    textarea: 0,
    polygon: 0
};

function getUniqueName(type) {
    if (!typeCounters[type]) typeCounters[type] = 0;
    typeCounters[type]++;
    let label = type.charAt(0).toUpperCase() + type.slice(1);
    if (type === 'rect') label = 'Rectangle';
    return label + ' ' + typeCounters[type];
}

// UI Control Elements
const thicknessControls = document.getElementById('thickness-controls');
const fontControls = document.getElementById('format-text-group');
const fillControlGroup = document.getElementById('fill-control-group');
const radiusControls = document.getElementById('radius-controls');
const layersSidebar = document.getElementById('layers-sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');

// Ribbon Controls
const ribbonTabs = document.querySelectorAll('.ribbon-tab');
const ribbonContents = document.querySelectorAll('.ribbon-content');

// Tab Switching
// Tab Switching
ribbonTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // Deactivate all tabs and contents
        document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ribbon-content').forEach(c => c.classList.remove('active'));

        // Activate clicked tab
        tab.classList.add('active');
        document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
});

// Horizontal Scroll for Ribbon
document.querySelectorAll('.ribbon-content').forEach(content => {
    content.addEventListener('wheel', (evt) => {
        evt.preventDefault();
        content.scrollLeft += evt.deltaY;
    });
});

// Load image from storage
chrome.storage.local.get(['capturedImage', 'cropData'], (result) => {
    if (result.capturedImage) {
        img.src = result.capturedImage;
        cropData = result.cropData;
        img.onload = () => {
            if (cropData) {
                canvas.width = cropData.w;
                canvas.height = cropData.h;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }
            saveState(); // Capture initial state
            redraw();
            updateLayersList();
        };
    }
});

function saveState() {
    const currentState = {
        shapes: JSON.parse(JSON.stringify(shapes)),
        cropData: cropData ? JSON.parse(JSON.stringify(cropData)) : null,
        width: canvas.width,
        height: canvas.height
    };

    // Only save if different from current top of history
    if (historyIndex >= 0) {
        const lastState = history[historyIndex];
        if (JSON.stringify(lastState) === JSON.stringify(currentState)) {
            return;
        }
    }

    // Remove any "redo" states if we're in the middle of history
    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }

    history.push(currentState);
    historyIndex++;

    // Limit history size to 50 steps
    if (history.length > 50) {
        history.shift();
        historyIndex--;
    }

    // Auto-expand sidebar when a shape is added/modified, if not manually collapsed
    if (shapes.length > 0 && layersSidebar && layersSidebar.classList.contains('collapsed') && !userManuallyCollapsedSidebar) {
        layersSidebar.classList.remove('collapsed');
    }

    updateHistoryButtons();
    updateLayersList();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        const state = history[historyIndex];
        if (state) {
            applyState(state);
        } else {
            console.error('Undo: History state not found at index', historyIndex);
            // Try to recover
            if (historyIndex < history.length - 1) historyIndex++;
        }
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        const state = history[historyIndex];
        if (state) {
            applyState(state);
        } else {
            console.error('Redo: History state not found at index', historyIndex);
            if (historyIndex > 0) historyIndex--;
        }
    }
}

function applyState(state) {
    if (!state) return;

    // Validate state data
    shapes = state.shapes ? JSON.parse(JSON.stringify(state.shapes)) : [];
    cropData = state.cropData ? JSON.parse(JSON.stringify(state.cropData)) : null;

    // Ensure dimensions are valid positive numbers
    if (Number.isFinite(state.width) && state.width > 0) {
        canvas.width = state.width;
    }
    if (Number.isFinite(state.height) && state.height > 0) {
        canvas.height = state.height;
    }

    selectedShape = null;
    cropSelection = null;

    if (currentTool === 'crop') {
        const confirmBtn = document.getElementById('confirm-crop-btn');
        if (confirmBtn) confirmBtn.style.display = 'none';

        // If restoring state while crop tool is active, we might need to reset tool state
        // or just ensure crop overlay is drawn if it was in the state (but cropSelection isn't in state)
        // cropSelection is ephemeral, so we clear it.
    } else {
        const cropActions = document.getElementById('crop-actions');
        if (cropActions) cropActions.style.display = 'none';
    }

    redraw();
    updateHistoryButtons();
    updateLayersList();
}

function updateHistoryButtons() {
    const btnUndoRibbon = document.getElementById('btn-undo-ribbon');
    const btnRedoRibbon = document.getElementById('btn-redo-ribbon');

    if (btnUndoRibbon) {
        btnUndoRibbon.disabled = historyIndex <= 0;
        btnUndoRibbon.style.opacity = historyIndex > 0 ? '1' : '0.3';
    }
    if (btnRedoRibbon) {
        btnRedoRibbon.disabled = historyIndex >= history.length - 1;
        btnRedoRibbon.style.opacity = historyIndex < history.length - 1 ? '1' : '0.3';
    }
}

function redraw() {
    // Ensure valid context and dimensions
    if (!ctx || canvas.width === 0 || canvas.height === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    if (img && img.complete && img.naturalWidth > 0) {
        if (cropData && cropData.w > 0 && cropData.h > 0) {
            ctx.drawImage(img, cropData.x, cropData.y, cropData.w, cropData.h, 0, 0, cropData.w, cropData.h);
        } else {
            ctx.drawImage(img, 0, 0);
        }
    }

    // Draw all shapes
    shapes.forEach(shape => {
        drawShape(shape);
        if (shape === selectedShape) {
            drawSelectionHighlight(shape);
        }
    });

    // We don't call updateLayersList here to avoid infinite loops 
    // but we might want to sync the "active" state in sidebar.
    syncSidebarSelection();

    // Draw crop overlay if active
    if (currentTool === 'crop' && cropSelection) {
        drawCropOverlayInternal(ctx, cropSelection, canvas.width, canvas.height);
    }
}

function updateUIForSelection(shape) {
    if (shape) {
        updateThicknessInputFromShape(shape);
        updateFontInputsFromShape(shape);
        updateRadiusInputsFromShape(shape);
        updatePolygonSidesInputFromShape(shape);

        // Update group visibilities (don't force tab switch anymore)
        const radiusGroup = document.getElementById('format-radius-group');
        const polygonGroup = document.getElementById('format-polygon-group');
        const textGroup = document.getElementById('format-text-group');

        if (radiusGroup) radiusGroup.style.display = (shape.type === 'rect') ? 'flex' : 'none';
        if (polygonGroup) polygonGroup.style.display = (shape.type === 'polygon') ? 'flex' : 'none';
        if (textGroup) textGroup.style.display = (shape.type === 'text' || shape.type === 'textarea') ? 'flex' : 'none';

        // Update Fill visibility on Home tab
        const fillGroup = document.getElementById('fill-control-group');
        if (fillGroup) {
            const supportsFill = ['rect', 'circle', 'oval', 'polygon'].includes(shape.type);
            fillGroup.style.display = supportsFill ? 'flex' : 'none';
        }
    } else {
        updateThicknessInputFromShape(null);
        updateFontInputsFromShape(null);
        updateRadiusInputsFromShape(null);
        updatePolygonSidesInputFromShape(null);

        const radiusGroup = document.getElementById('format-radius-group');
        const polygonGroup = document.getElementById('format-polygon-group');
        const textGroup = document.getElementById('format-text-group');

        if (radiusGroup) radiusGroup.style.display = (currentTool === 'rect') ? 'flex' : 'none';
        if (polygonGroup) polygonGroup.style.display = (currentTool === 'polygon') ? 'flex' : 'none';
        if (textGroup) textGroup.style.display = (currentTool === 'text' || currentTool === 'textarea') ? 'flex' : 'none';

        const fillGroup = document.getElementById('fill-control-group');
        if (fillGroup) {
            const supportsFill = ['rect', 'circle', 'oval', 'polygon'].includes(currentTool);
            fillGroup.style.display = supportsFill ? 'flex' : 'none';
        }
    }
}

function syncSidebarSelection() {
    const items = document.querySelectorAll('.layer-item');
    items.forEach(item => {
        const index = parseInt(item.dataset.index);
        item.classList.toggle('active', shapes[index] === selectedShape);
    });
}

function updateLayersList() {
    const list = document.getElementById('layers-list');
    const badge = document.getElementById('count-badge');
    if (!list) return;

    list.innerHTML = '';
    badge.innerText = shapes.length;

    // We show layers in reverse order (topmost first)
    [...shapes].reverse().forEach((shape, revIndex) => {
        const index = shapes.length - 1 - revIndex;
        if (!shape.name) shape.name = getUniqueName(shape.type);

        const item = document.createElement('div');
        item.className = 'layer-item';
        if (shape === selectedShape) item.classList.add('active');
        item.dataset.index = index;
        item.draggable = true;

        item.innerHTML = `
            <div class="layer-icon">${getLayerIcon(shape)}</div>
            <div class="layer-info">
                <div class="layer-name">${shape.name}</div>
                <div class="layer-type">${shape.type}</div>
            </div>
            <div class="layer-actions">
                <button class="layer-action-btn delete" title="Delete Layer">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;

        item.addEventListener('click', () => {
            selectedShape = shapes[index];
            updateUIForSelection(selectedShape);
            redraw();
        });

        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const nameEl = item.querySelector('.layer-name');
            const currentName = shape.name;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'layer-name-input';
            input.value = currentName;

            nameEl.replaceWith(input);
            input.focus();
            input.select();

            let isRenaming = true;
            const finishRename = () => {
                if (!isRenaming) return;
                isRenaming = false;
                const newName = input.value.trim() || currentName;
                shape.name = newName;
                updateLayersList();
                saveState();
            };

            input.addEventListener('blur', finishRename);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    finishRename();
                } else if (e.key === 'Escape') {
                    input.value = currentName;
                    isRenaming = false; // Prevent redundant call via blur
                    updateLayersList(); // Just restore the UI
                }
            });
        });

        item.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            shapes.splice(index, 1);
            if (selectedShape === shape) selectedShape = null;
            redraw();
            saveState();
        });

        // Drag and Drop listeners
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);

        list.appendChild(item);
    });
}

function getLayerIcon(shape) {
    const type = shape.type;
    const stroke = shape.color || 'currentColor';
    const fill = (shape.fillColor && shape.fillColor !== '#ffffff00' && shape.fillColor !== 'transparent') ? shape.fillColor : 'none';
    const fillOpacity = shape.fillOpacity !== undefined ? shape.fillOpacity : 1.0;
    const strokeOpacity = shape.strokeOpacity !== undefined ? shape.strokeOpacity : 1.0;

    // Convert hex to rgba for the SVG to respect opacity
    const strokeRGBA = hexToRGBA(stroke, strokeOpacity);
    const fillRGBA = hexToRGBA(fill, fillOpacity);

    switch (type) {
        case 'line': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="none"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        case 'rect': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="${fillRGBA}"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
        case 'circle': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="${fillRGBA}"><circle cx="12" cy="12" r="10"></circle></svg>`;
        case 'oval': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="${fillRGBA}"><ellipse cx="12" cy="12" rx="10" ry="6"></ellipse></svg>`;
        case 'arrow': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="${strokeRGBA}"><line x1="5" y1="19" x2="19" y2="5"></line><polyline points="12 5 19 5 19 12"></polyline></svg>`;
        case 'pen': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="none"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path></svg>`;
        case 'text': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="none"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>`;
        case 'textarea': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="13" y2="16"></line></svg>`;
        case 'polygon': return `<svg viewBox="0 0 24 24" width="16" height="16" stroke="${strokeRGBA}" fill="${fillRGBA}"><path d="M12 2L2 9l4 11h12l4-11z"></path></svg>`;
        default: return '';
    }
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
}

function handleDragLeave() {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const toIndex = parseInt(this.dataset.index);

    if (fromIndex === toIndex) return;

    // Move the shape in the array
    const shape = shapes.splice(fromIndex, 1)[0];
    shapes.splice(toIndex, 0, shape);

    redraw();
    saveState();
}

function handleDragEnd() {
    this.classList.remove('dragging');
    draggedItem = null;
    document.querySelectorAll('.layer-item').forEach(item => item.classList.remove('drag-over'));
}

function drawShape(shape) {
    ctx.save();
    if (shape.rotation) {
        const center = getShapeCenter(shape);
        ctx.translate(center.x, center.y);
        ctx.rotate(shape.rotation);
        ctx.translate(-center.x, -center.y);
    }

    switch (shape.type) {
        case 'pen':
            drawPen(ctx, shape, hexToRGBA);
            break;
        case 'text':
            drawText(ctx, shape, hexToRGBA);
            break;
        case 'textarea':
            drawTextArea(ctx, shape, hexToRGBA);
            break;
        case 'line':
        case 'arrow':
        case 'rect':
        case 'circle':
        case 'oval':
        case 'polygon':
            drawShapeInternal(ctx, shape, hexToRGBA);
            break;
    }
    ctx.restore();
}

function drawSelectionHighlight(shape) {
    const bounds = getShapeBounds(shape);
    drawSelectionHighlightInternal(ctx, bounds, RESIZE_HANDLE_SIZE, shape.rotation || 0);
}

function updateCursor(mouseX, mouseY) {
    if (mouseX === undefined || mouseY === undefined) {
        canvas.style.cursor = '';
        canvas.classList.remove('crop-cursor', 'eraser-cursor', 'rotate-cursor');
        return;
    }

    // Default: no custom classes
    canvas.classList.remove('crop-cursor', 'eraser-cursor', 'rotate-cursor');

    if (isRotating) {
        canvas.classList.add('rotate-cursor');
        canvas.style.cursor = '';
        return;
    }

    if (isResizing && activeHandle && selectedShape) {
        const bounds = getShapeBounds(selectedShape);
        const handles = getResizeHandles(bounds, RESIZE_HANDLE_SIZE, selectedShape.rotation || 0);
        if (handles[activeHandle]) {
            canvas.style.cursor = handles[activeHandle].cursor;
            return;
        }
    }

    // Check for handles first (unified behavior)
    const handle = getHandleAtPoint(mouseX, mouseY, selectedShape);
    if (handle && currentTool !== 'eraser' && currentTool !== 'crop') {
        if (handle === 'rotate') {
            canvas.classList.add('rotate-cursor');
            canvas.style.cursor = '';
        } else {
            const bounds = getShapeBounds(selectedShape);
            const handles = getResizeHandles(bounds, RESIZE_HANDLE_SIZE, selectedShape.rotation || 0);
            canvas.style.cursor = handles[handle].cursor;
        }
        return;
    }

    if (currentTool === 'eraser') {
        const isOverShape = shapes.some(s => isPointInShape(mouseX, mouseY, s));
        if (isOverShape) {
            canvas.classList.add('eraser-cursor');
            canvas.style.cursor = '';
        } else {
            canvas.style.cursor = '';
        }
    } else if (currentTool === 'select') {
        const isOverShape = shapes.some(s => isPointInShape(mouseX, mouseY, s));
        if (isOverShape) {
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = '';
        }
    } else if (currentTool === 'crop' && cropSelection) {
        const handles = getCropHandles(cropSelection, RESIZE_HANDLE_SIZE);
        let foundHandle = null;
        for (const [type, h] of Object.entries(handles)) {
            if (mouseX >= h.x - RESIZE_HANDLE_SIZE / 2 && mouseX <= h.x + RESIZE_HANDLE_SIZE / 2 &&
                mouseY >= h.y - RESIZE_HANDLE_SIZE / 2 && mouseY <= h.y + RESIZE_HANDLE_SIZE / 2) {
                foundHandle = h;
                break;
            }
        }
        if (foundHandle) {
            canvas.style.cursor = foundHandle.cursor;
        } else {
            canvas.classList.add('crop-cursor');
            canvas.style.cursor = '';
        }
    } else {
        canvas.style.cursor = '';
        if (currentTool === 'crop') {
            canvas.classList.add('crop-cursor');
        }
    }
}

function getHandleAtPoint(x, y, shape) {
    if (!shape) return null;
    const bounds = getShapeBounds(shape);
    const handles = getResizeHandles(bounds, RESIZE_HANDLE_SIZE, shape.rotation || 0);
    for (const [type, handle] of Object.entries(handles)) {
        if (Math.abs(x - handle.x) <= RESIZE_HANDLE_SIZE / 2 + 2 &&
            Math.abs(y - handle.y) <= RESIZE_HANDLE_SIZE / 2 + 2) {
            return type;
        }
    }
    return null;
}

// Tool Selection (Ribbon)
document.querySelectorAll('.ribbon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.id === 'tool-clear-ribbon' || btn.id === 'btn-undo-ribbon' || btn.id === 'btn-redo-ribbon') return;

        const active = document.querySelector('.ribbon-btn.active');
        if (active) active.classList.remove('active');
        btn.classList.add('active');

        currentTool = btn.id.replace('tool-', '').replace('-ribbon', '');

        selectedShape = null;
        canvas.className = (currentTool === 'select' || currentTool === 'eraser') ? 'selecting' : '';
        canvas.style.cursor = '';
        updateCursor();
        redraw();

        const existingInput = document.querySelector('.text-input');
        if (existingInput) existingInput.remove();

        updateUIForSelection(null);

        // Handle crop actions visibility
        const cropActions = document.getElementById('crop-actions-ribbon');
        if (currentTool === 'crop') {
            cropActions.style.display = 'flex';
            document.getElementById('confirm-crop-btn').style.display = 'none';
        } else {
            if (cropActions) cropActions.style.display = 'none';
            cropSelection = null;
            redraw();
        }
    });
});

function updateRadiusInputsFromShape(shape) {
    const tl = document.getElementById('radius-tl');
    const tr = document.getElementById('radius-tr');
    const bl = document.getElementById('radius-bl');
    const br = document.getElementById('radius-br');
    const sync = document.getElementById('radius-sync');

    if (shape && shape.type === 'rect' && shape.borderRadius) {
        tl.value = shape.borderRadius.tl || 0;
        tr.value = shape.borderRadius.tr || 0;
        bl.value = shape.borderRadius.bl || 0;
        br.value = shape.borderRadius.br || 0;

        // Check if all are same to keep sync checked
        const allSame = shape.borderRadius.tl === shape.borderRadius.tr &&
            shape.borderRadius.tl === shape.borderRadius.bl &&
            shape.borderRadius.tl === shape.borderRadius.br;
        sync.checked = allSame;
    } else {
        tl.value = 0;
        tr.value = 0;
        bl.value = 0;
        br.value = 0;
        sync.checked = true;
    }
}

function updatePolygonSidesInputFromShape(shape) {
    const sidesInput = document.getElementById('polygon-sides');
    const sidesRange = document.getElementById('polygon-sides-range');
    const val = (shape && shape.sides) ? shape.sides : currentSides;
    sidesInput.value = val;
    sidesRange.value = val;
}

function updateThicknessInputFromShape(shape) {
    const thicknessInput = document.getElementById('line-thickness');
    const val = (shape && shape.thickness) ? shape.thickness : currentThickness;
    thicknessInput.value = val;
    const valDisplay = document.getElementById('thickness-val');
    if (valDisplay) valDisplay.innerText = `${val}px`;
}

function updateFontInputsFromShape(shape) {
    const familySelect = document.getElementById('font-family');
    const sizeInput = document.getElementById('font-size');

    if (shape && (shape.type === 'text' || shape.type === 'textarea')) {
        familySelect.value = shape.fontFamily || 'Inter, sans-serif';
        sizeInput.value = shape.fontSize || 20;
        document.getElementById('btn-bold').classList.toggle('active', !!shape.bold);
        document.getElementById('btn-italic').classList.toggle('active', !!shape.italic);
        document.getElementById('btn-underline').classList.toggle('active', !!shape.underline);
    } else {
        familySelect.value = currentFontFamily;
        sizeInput.value = currentFontSize;
        document.getElementById('btn-bold').classList.toggle('active', currentBold);
        document.getElementById('btn-italic').classList.toggle('active', currentItalic);
        document.getElementById('btn-underline').classList.toggle('active', currentUnderline);
    }

    // Sync color pickers and fill checkbox
    if (shape) {
        document.getElementById('color-picker').value = shape.color || currentColor;
        const sOpacity = (shape.strokeOpacity !== undefined) ? shape.strokeOpacity : currentStrokeOpacity;
        document.getElementById('stroke-opacity').value = Math.round(sOpacity * 100);
        document.getElementById('stroke-opacity-val').innerText = `${Math.round(sOpacity * 100)}%`;

        if (shape.fillColor && shape.fillColor !== '#ffffff00' && shape.fillColor !== 'transparent') {
            document.getElementById('fill-color-picker').value = shape.fillColor;
            document.getElementById('fill-enabled').checked = true;
            const fOpacity = (shape.fillOpacity !== undefined) ? shape.fillOpacity : currentFillOpacity;
            document.getElementById('fill-opacity').value = Math.round(fOpacity * 100);
            document.getElementById('fill-opacity-val').innerText = `${Math.round(fOpacity * 100)}%`;
        } else {
            document.getElementById('fill-enabled').checked = false;
            document.getElementById('fill-color-picker').value = currentFillColor;
            const fOpacity = currentFillOpacity;
            document.getElementById('fill-opacity').value = Math.round(fOpacity * 100);
            document.getElementById('fill-opacity-val').innerText = `${Math.round(fOpacity * 100)}%`;
        }

        // Sync stroke checkbox
        if (shape.color && shape.color !== '#ffffff00' && shape.color !== 'transparent') {
            document.getElementById('stroke-enabled').checked = true;
        } else {
            document.getElementById('stroke-enabled').checked = false;
        }
    } else {
        document.getElementById('color-picker').value = currentColor;
        document.getElementById('stroke-opacity').value = Math.round(currentStrokeOpacity * 100);
        document.getElementById('stroke-opacity-val').innerText = `${Math.round(currentStrokeOpacity * 100)}%`;

        document.getElementById('fill-enabled').checked = isFillEnabled;
        document.getElementById('fill-color-picker').value = currentFillColor;
        document.getElementById('fill-opacity').value = Math.round(currentFillOpacity * 100);
        document.getElementById('fill-opacity-val').innerText = `${Math.round(currentFillOpacity * 100)}%`;

        document.getElementById('stroke-enabled').checked = isStrokeEnabled;
    }

    if (shape && (shape.type === 'rect' || shape.type === 'circle' || shape.type === 'oval' || shape.type === 'polygon')) {
        document.getElementById('fill-control-group').style.display = 'flex';
    } else if (!shape && (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'oval' || currentTool === 'polygon')) {
        document.getElementById('fill-control-group').style.display = 'flex';
    } else {
        document.getElementById('fill-control-group').style.display = 'none';
    }
}

// Style Toggles
['bold', 'italic', 'underline'].forEach(style => {
    const btn = document.getElementById(`btn-${style}`);

    // Prevent focus loss from text input
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });

    btn.addEventListener('click', () => {
        const isActive = btn.classList.toggle('active');

        if (selectedShape && (selectedShape.type === 'text' || selectedShape.type === 'textarea')) {
            selectedShape[style] = isActive;
            redraw();
        } else {
            if (style === 'bold') currentBold = isActive;
            if (style === 'italic') currentItalic = isActive;
            if (style === 'underline') currentUnderline = isActive;
        }

        // Update active input if it exists
        const input = document.querySelector('.text-input');
        if (input) {
            if (style === 'bold') input.style.fontWeight = isActive ? 'bold' : 'normal';
            if (style === 'italic') input.style.fontStyle = isActive ? 'italic' : 'normal';
            if (style === 'underline') input.style.textDecoration = isActive ? 'underline' : 'none';
        }
    });
});

// Also prevent focus loss for other font controls
['font-family', 'font-size'].forEach(id => {
    document.getElementById(id).addEventListener('mousedown', (e) => {
        // We only want to prevent focus loss if a text input is active
        if (document.querySelector('.text-input')) {
            // e.preventDefault(); // Don't prevent default for selects/inputs as it breaks them
            // Instead, we catch the blur and prevent it or refocus? 
            // Actually, for select/input, it's better to let them take focus but handle the blur.
        }
    });
});

// Update selected shape when radius inputs change
const radiusSync = document.getElementById('radius-sync');
['tl', 'tr', 'bl', 'br'].forEach(pos => {
    document.getElementById(`radius-${pos}`).addEventListener('input', (e) => {
        const val = parseInt(e.target.value) || 0;

        if (radiusSync.checked) {
            ['tl', 'tr', 'bl', 'br'].forEach(p => {
                document.getElementById(`radius-${p}`).value = val;
                if (selectedShape && selectedShape.type === 'rect') {
                    if (!selectedShape.borderRadius) selectedShape.borderRadius = {};
                    selectedShape.borderRadius[p] = val;
                }
            });
        } else {
            if (selectedShape && selectedShape.type === 'rect') {
                if (!selectedShape.borderRadius) selectedShape.borderRadius = {};
                selectedShape.borderRadius[pos] = val;
            }
        }
        redraw();
    });
});

radiusSync.addEventListener('change', () => {
    if (radiusSync.checked) {
        const tlVal = parseInt(document.getElementById('radius-tl').value) || 0;
        ['tr', 'bl', 'br'].forEach(p => {
            document.getElementById(`radius-${p}`).value = tlVal;
            if (selectedShape && selectedShape.type === 'rect') {
                if (!selectedShape.borderRadius) selectedShape.borderRadius = {};
                selectedShape.borderRadius[p] = tlVal;
            }
        });
        redraw();
    }
});

const polygonSidesInput = document.getElementById('polygon-sides');
const polygonSidesRange = document.getElementById('polygon-sides-range');

if (polygonSidesInput && polygonSidesRange) {
    [polygonSidesInput, polygonSidesRange].forEach(el => {
        el.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) || 3;
            currentSides = val;
            polygonSidesInput.value = val;
            polygonSidesRange.value = val;

            if (selectedShape && selectedShape.type === 'polygon') {
                selectedShape.sides = val;
                redraw();
            }
        });
    });
}

document.getElementById('tool-clear-ribbon').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all shapes?')) {
        shapes = [];
        selectedShape = null;
        // Reset counters
        Object.keys(typeCounters).forEach(key => typeCounters[key] = 0);
        redraw();
        saveState();
        updateLayersList();
    }
});

document.getElementById('btn-undo-ribbon').addEventListener('click', undo);
document.getElementById('btn-redo-ribbon').addEventListener('click', redo);

document.getElementById('line-thickness').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 1;
    currentThickness = val;
    const valDisplay = document.getElementById('thickness-val');
    if (valDisplay) valDisplay.innerText = `${val}px`;
    if (selectedShape) {
        selectedShape.thickness = val;
        redraw();
    }
});

document.getElementById('stroke-opacity').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) / 100;
    currentStrokeOpacity = val;
    document.getElementById('stroke-opacity-val').innerText = `${e.target.value}%`;
    if (selectedShape) {
        selectedShape.strokeOpacity = val;
        redraw();
        updateLayersList();
    }
});

document.getElementById('fill-opacity').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) / 100;
    currentFillOpacity = val;
    document.getElementById('fill-opacity-val').innerText = `${e.target.value}%`;
    if (selectedShape && (selectedShape.type === 'rect' || selectedShape.type === 'circle' || selectedShape.type === 'oval' || selectedShape.type === 'polygon')) {
        selectedShape.fillOpacity = val;
        redraw();
        updateLayersList();
    }
});

document.getElementById('color-picker').addEventListener('input', (e) => {
    currentColor = e.target.value;
    if (selectedShape) {
        selectedShape.color = currentColor;
        redraw();
        updateLayersList();
    }
});

document.getElementById('fill-color-picker').addEventListener('input', (e) => {
    currentFillColor = e.target.value;
    if (selectedShape && (selectedShape.type === 'rect' || selectedShape.type === 'circle' || selectedShape.type === 'oval' || selectedShape.type === 'polygon') && document.getElementById('fill-enabled').checked) {
        selectedShape.fillColor = currentFillColor;
        redraw();
        updateLayersList();
    }
});

document.getElementById('fill-enabled').addEventListener('change', (e) => {
    isFillEnabled = e.target.checked;
    if (selectedShape && (selectedShape.type === 'rect' || selectedShape.type === 'circle' || selectedShape.type === 'oval' || selectedShape.type === 'polygon')) {
        selectedShape.fillColor = isFillEnabled ? currentFillColor : '#ffffff00';
        redraw();
        updateLayersList();
    }
});

document.getElementById('stroke-enabled').addEventListener('change', (e) => {
    isStrokeEnabled = e.target.checked;
    if (selectedShape) {
        selectedShape.color = isStrokeEnabled ? currentColor : '#ffffff00';
        redraw();
        updateLayersList();
    }
});

document.getElementById('font-family').addEventListener('change', (e) => {
    const val = e.target.value;
    currentFontFamily = val;
    if (selectedShape && (selectedShape.type === 'text' || selectedShape.type === 'textarea')) {
        selectedShape.fontFamily = val;
        redraw();
    }
    const input = document.querySelector('.text-input');
    if (input) {
        input.style.fontFamily = val;
    }
});

document.getElementById('font-size').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 12;
    currentFontSize = val;
    if (selectedShape && (selectedShape.type === 'text' || selectedShape.type === 'textarea')) {
        selectedShape.fontSize = val;
        redraw();
    }
    const input = document.querySelector('.text-input');
    if (input) {
        input.style.fontSize = `${val}px`;
        input.style.lineHeight = `${val * 1.2}px`;
    }
});

function initiateTextEdit(shapeOrNull, x, y, isTextArea = false) {
    const isEditing = !!shapeOrNull;
    const shapeToEdit = isEditing ? shapeOrNull : {
        type: isTextArea ? 'textarea' : 'text',
        x: x,
        y: y,
        w: isTextArea ? 0 : undefined,
        h: isTextArea ? 0 : undefined,
        text: '',
        color: currentColor,
        fontSize: currentFontSize,
        fontFamily: currentFontFamily,
        bold: currentBold,
        italic: currentItalic,
        underline: currentUnderline,
        strokeOpacity: currentStrokeOpacity,
        name: getUniqueName(isTextArea ? 'textarea' : 'text')
    };

    if (isEditing) {
        // Update global state to match the shape being edited
        currentBold = !!shapeToEdit.bold;
        currentItalic = !!shapeToEdit.italic;
        currentUnderline = !!shapeToEdit.underline;
        currentFontSize = shapeToEdit.fontSize || 20;
        currentFontFamily = shapeToEdit.fontFamily || 'Inter, sans-serif';
        currentColor = shapeToEdit.color;
        document.getElementById('color-picker').value = currentColor;
        updateFontInputsFromShape(null); // Sync toolbar buttons

        const actualIndex = shapes.indexOf(shapeToEdit);
        if (actualIndex !== -1) shapes.splice(actualIndex, 1);
        redraw();
    }

    const input = document.createElement('div');
    input.className = 'text-input';
    input.contentEditable = true;
    document.body.appendChild(input);

    const canvasRect = canvas.getBoundingClientRect();
    // Calculate scale factors (this accounts for both 'zoom' property and natural scaling)
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;

    // Apply scaling to position
    input.style.left = `${canvasRect.left + (shapeToEdit.x * scaleX) - (isTextArea ? 0 : 5)}px`;
    input.style.top = `${canvasRect.top + (shapeToEdit.y * scaleY) - (isTextArea ? 0 : 5)}px`;

    const _isTextArea = isTextArea || shapeToEdit.type === 'textarea';
    if (_isTextArea && shapeToEdit.w) {
        input.style.width = `${shapeToEdit.w * scaleX}px`;
        input.style.height = `${shapeToEdit.h * scaleY}px`;
        input.style.border = '1px dotted #6366f1';
        input.style.overflow = 'auto';
    }

    input.style.color = shapeToEdit.color;
    // Apply scaling to font size
    const visualFontSize = (shapeToEdit.fontSize || 20) * scaleX;
    input.style.fontSize = `${visualFontSize}px`;
    input.style.fontFamily = shapeToEdit.fontFamily || 'Inter, sans-serif';
    input.style.fontWeight = shapeToEdit.bold ? 'bold' : 'normal';
    input.style.fontStyle = shapeToEdit.italic ? 'italic' : 'normal';
    input.style.textDecoration = shapeToEdit.underline ? 'underline' : 'none';
    input.style.lineHeight = `${visualFontSize * 1.2}px`;
    input.innerText = shapeToEdit.text;

    setTimeout(() => {
        input.focus();
        if (isEditing) {
            const range = document.createRange();
            range.selectNodeContents(input);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }, 0);

    let isCancelled = false;
    const handleFinish = () => {
        if (isCancelled) return;
        const text = input.innerText.trim();
        if (text) {
            shapeToEdit.text = text;
            shapeToEdit.color = currentColor;
            shapeToEdit.fontSize = currentFontSize;
            shapeToEdit.fontFamily = currentFontFamily;
            shapeToEdit.bold = currentBold;
            shapeToEdit.italic = currentItalic;
            shapeToEdit.underline = currentUnderline;
            shapeToEdit.strokeOpacity = currentStrokeOpacity;
            shapes.push(shapeToEdit);
            selectedShape = shapeToEdit;
        }
        input.remove();
        redraw();
        saveState();
        updateUIForSelection(selectedShape);
    };

    input.addEventListener('blur', handleFinish);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !_isTextArea) {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            isCancelled = true;
            if (isEditing) shapes.push(shapeToEdit);
            input.remove();
            redraw();
        }
    });
}

// Drawing Logic
canvas.addEventListener('mousedown', (e) => {
    const { x: mouseX, y: mouseY } = getMousePos(e);

    // 1. Resizing check (ALWAYS check handles of selected shape first)
    const handle = getHandleAtPoint(mouseX, mouseY, selectedShape);
    if (handle && currentTool !== 'eraser' && currentTool !== 'crop') {
        if (handle === 'rotate') {
            isRotating = true;
        } else {
            isResizing = true;
        }
        isDrawing = true;
        activeHandle = handle;
        dragStartX = mouseX;
        dragStartY = mouseY;
        return;
    }

    // 2. Selection/Movement (Select Tool) or Eraser
    if (currentTool === 'select' || currentTool === 'eraser') {
        const foundIndex = shapes.slice().reverse().findIndex(s => isPointInShape(mouseX, mouseY, s));
        if (foundIndex !== -1) {
            const actualIndex = shapes.length - 1 - foundIndex;
            const clickedShape = shapes[actualIndex];

            if (currentTool === 'eraser') {
                shapes.splice(actualIndex, 1);
                selectedShape = null;
                updateUIForSelection(null);
                redraw();
                saveState();
                return;
            }

            // Select Tool logic
            selectedShape = clickedShape;
            isDrawing = true;
            dragStartX = mouseX;
            dragStartY = mouseY;
            updateUIForSelection(selectedShape);
            redraw();
            return;
        } else {
            selectedShape = null;
            updateUIForSelection(null);
            redraw();
            return;
        }
    }

    // 3. Crop Logic
    if (currentTool === 'crop') {
        // ... (keep crop handles logic)
        if (cropSelection) {
            const handles = getCropHandles(cropSelection, RESIZE_HANDLE_SIZE);
            for (const [type, h] of Object.entries(handles)) {
                if (mouseX >= h.x - RESIZE_HANDLE_SIZE / 2 && mouseX <= h.x + RESIZE_HANDLE_SIZE / 2 &&
                    mouseY >= h.y - RESIZE_HANDLE_SIZE / 2 && mouseY <= h.y + RESIZE_HANDLE_SIZE / 2) {
                    isResizing = true;
                    isDrawing = true;
                    activeHandle = type;
                    dragStartX = mouseX;
                    dragStartY = mouseY;
                    return;
                }
            }
        }
        isResizing = false;
        isDrawing = true;
        startX = mouseX;
        startY = mouseY;
        cropSelection = { x: mouseX, y: mouseY, w: 0, h: 0 };
        redraw();
        return;
    }

    // 4. Drawing Tools (Pen, Line, Shape, Text)
    // If you click while one of these is active, we start DRAWING, 
    // regardless of whether there's a shape underneath (unless we hit a handle above).

    isDrawing = true;
    startX = mouseX;
    startY = mouseY;

    // If text tool, check if user clicked on a text/textarea shape specifically to edit it
    if (currentTool === 'text' || currentTool === 'textarea') {
        const foundIndex = shapes.slice().reverse().findIndex(s => (s.type === 'text' || s.type === 'textarea') && isPointInShape(mouseX, mouseY, s));
        if (foundIndex !== -1) {
            initiateTextEdit(shapes[shapes.length - 1 - foundIndex]);
            isDrawing = false;
            return;
        }

        if (currentTool === 'text') {
            initiateTextEdit(null, mouseX, mouseY);
            isDrawing = false;
            return;
        }
        // If textarea tool, it will fall through to drawing a box in mouseup
    }

    if (currentTool === 'pen') {
        const strokeEnabled = document.getElementById('stroke-enabled').checked;
        shapes.push({
            type: 'pen',
            points: [{ x: mouseX, y: mouseY }],
            color: strokeEnabled ? currentColor : '#ffffff00',
            thickness: currentThickness,
            strokeOpacity: currentStrokeOpacity,
            name: getUniqueName('pen')
        });
    } else {
        selectedShape = null; // Clear selection when starting a new shape
    }
});

canvas.addEventListener('dblclick', (e) => {
    const { x: mouseX, y: mouseY } = getMousePos(e);

    const foundIndex = shapes.slice().reverse().findIndex(s => (s.type === 'text' || s.type === 'textarea') && isPointInShape(mouseX, mouseY, s));
    if (foundIndex !== -1) {
        const actualIndex = shapes.length - 1 - foundIndex;
        initiateTextEdit(shapes[actualIndex]);
    }
});

canvas.addEventListener('mousemove', (e) => {
    const { x: currentX, y: currentY } = getMousePos(e);

    updateCursor(currentX, currentY);

    if (!isDrawing) return;

    if (isRotating && selectedShape) {
        const center = getShapeCenter(selectedShape);
        const angle = Math.atan2(currentY - center.y, currentX - center.x);
        // Offset by Math.PI/2 because the handle is at the top (-90 degrees)
        selectedShape.rotation = angle + Math.PI / 2;
        redraw();
        return;
    }

    if (isResizing && selectedShape && currentTool !== 'crop' && currentTool !== 'eraser') {
        let dx = currentX - dragStartX;
        let dy = currentY - dragStartY;

        let rotation = selectedShape.rotation || 0;
        let anchorPoint = null;
        const opposites = {
            nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e'
        };
        const oppHandle = opposites[activeHandle];

        if (rotation && oppHandle) {
            // Get the world position of the point that should stay fixed (the opposite handle)
            const bounds = getShapeBounds(selectedShape);
            const handles = getResizeHandles(bounds, RESIZE_HANDLE_SIZE, rotation);
            anchorPoint = { x: handles[oppHandle].x, y: handles[oppHandle].y };

            const cos = Math.cos(-rotation);
            const sin = Math.sin(-rotation);
            const rDx = dx * cos - dy * sin;
            const rDy = dx * sin + dy * cos;
            dx = rDx;
            dy = rDy;
        }

        resizeShape(selectedShape, activeHandle, dx, dy, currentX, currentY);

        if (rotation && anchorPoint && oppHandle) {
            // After resizing in local space, find where the anchor point moved to in world space
            const bounds = getShapeBounds(selectedShape);
            const handles = getResizeHandles(bounds, RESIZE_HANDLE_SIZE, rotation);
            const newAnchorPoint = { x: handles[oppHandle].x, y: handles[oppHandle].y };

            // Calculate the compensation needed to put the anchor back to its original world position
            const shiftX = anchorPoint.x - newAnchorPoint.x;
            const shiftY = anchorPoint.y - newAnchorPoint.y;

            if (['line', 'arrow'].includes(selectedShape.type)) {
                selectedShape.x1 += shiftX;
                selectedShape.y1 += shiftY;
                selectedShape.x2 += shiftX;
                selectedShape.y2 += shiftY;
            } else if (selectedShape.type === 'pen') {
                selectedShape.points.forEach(p => {
                    p.x += shiftX;
                    p.y += shiftY;
                });
            } else {
                selectedShape.x += shiftX;
                selectedShape.y += shiftY;
            }
        }

        dragStartX = currentX;
        dragStartY = currentY;
        redraw();
        return;
    }

    if (currentTool === 'select' || currentTool === 'eraser') {
        if (currentTool === 'select' && selectedShape && isDrawing && !isResizing) {
            const dx = currentX - dragStartX;
            const dy = currentY - dragStartY;
            moveShape(selectedShape, dx, dy);
            dragStartX = currentX;
            dragStartY = currentY;
            redraw();
            return;
        }
        return;
    }

    if (currentTool === 'crop') {
        if (isResizing && cropSelection) {
            const dx = currentX - dragStartX;
            const dy = currentY - dragStartY;
            resizeRect(cropSelection, activeHandle, dx, dy);
            dragStartX = currentX;
            dragStartY = currentY;
            redraw();
            return;
        }
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const w = Math.abs(currentX - startX);
        const h = Math.abs(currentY - startY);
        cropSelection = { x, y, w, h };
        redraw();
        return;
    }

    if (currentTool === 'pen') {
        shapes[shapes.length - 1].points.push({ x: currentX, y: currentY });
        redraw();
    } else if (['line', 'rect', 'circle', 'arrow', 'textarea', 'polygon'].includes(currentTool)) {
        redraw();
        // Draw the shape being created (not yet in shapes array) - passing true for isPreview
        const tempShape = createShape(currentTool, startX, startY, currentX, currentY, true);
        drawShape(tempShape);
    }
});

function createShape(type, x1, y1, x2, y2, isPreview = false) {
    const fillEnabled = document.getElementById('fill-enabled').checked;
    const strokeEnabled = document.getElementById('stroke-enabled').checked;
    const shape = {
        type,
        color: strokeEnabled ? currentColor : '#ffffff00',
        strokeOpacity: currentStrokeOpacity,
        fillColor: (fillEnabled && (type === 'rect' || type === 'circle' || type === 'polygon')) ? currentFillColor : '#ffffff00',
        fillOpacity: (type === 'rect' || type === 'circle' || type === 'polygon') ? currentFillOpacity : 1.0,
        thickness: currentThickness,
        name: isPreview ? '' : getUniqueName(type),
        isPreview: isPreview
    };
    switch (type) {
        case 'line':
        case 'arrow':
            shape.x1 = x1; shape.y1 = y1; shape.x2 = x2; shape.y2 = y2;
            break;
        case 'rect':
        case 'textarea':
            shape.x = Math.min(x1, x2);
            shape.y = Math.min(y1, y2);
            shape.w = Math.abs(x2 - x1);
            shape.h = Math.abs(y2 - y1);
            if (type === 'rect') {
                shape.borderRadius = {
                    tl: parseInt(document.getElementById('radius-tl').value) || 0,
                    tr: parseInt(document.getElementById('radius-tr').value) || 0,
                    br: parseInt(document.getElementById('radius-br').value) || 0,
                    bl: parseInt(document.getElementById('radius-bl').value) || 0
                };
            }
            if (type === 'textarea') {
                shape.text = isPreview ? '' : 'Type here...';
                shape.fontSize = currentFontSize;
                shape.fontFamily = currentFontFamily;
                shape.bold = currentBold;
                shape.italic = currentItalic;
                shape.underline = currentUnderline;
            }
            break;
        case 'circle':
            shape.x = x1; shape.y = y1;
            shape.r = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            break;
        case 'oval':
            shape.x = x1 + (x2 - x1) / 2;
            shape.y = y1 + (y2 - y1) / 2;
            shape.rx = Math.abs(x2 - x1) / 2;
            shape.ry = Math.abs(y2 - y1) / 2;
            break;
        case 'polygon':
            shape.x = Math.min(x1, x2);
            shape.y = Math.min(y1, y2);
            shape.w = Math.abs(x2 - x1);
            shape.h = Math.abs(y2 - y1);
            shape.sides = currentSides;
            break;
    }
    return shape;
}

function resizeShape(shape, handleType, dx, dy, mouseX, mouseY) {
    switch (shape.type) {
        case 'rect':
        case 'textarea':
        case 'polygon':
            resizeRect(shape, handleType, dx, dy);
            break;
        case 'oval':
            resizeOval(shape, handleType, dx, dy);
            break;
        case 'circle':
            // Convert circle to oval if stretching from side/corner
            shape.type = 'oval';
            shape.rx = shape.r;
            shape.ry = shape.r;
            delete shape.r;
            resizeOval(shape, handleType, dx, dy);
            break;
        case 'line':
        case 'arrow':
            resizeLine(shape, handleType, dx, dy, mouseX, mouseY);
            break;
        case 'text':
            resizeText(shape, handleType, dx, dy, updateFontInputsFromShape);
            break;
        case 'pen':
            resizePen(shape, handleType, dx, dy);
            break;
    }
}

function moveShape(shape, dx, dy) {
    if (shape.type === 'pen') {
        shape.points.forEach(p => { p.x += dx; p.y += dy; });
    } else if (['line', 'arrow'].includes(shape.type)) {
        shape.x1 += dx; shape.y1 += dy; shape.x2 += dx; shape.y2 += dy;
    } else {
        shape.x += dx; shape.y += dy;
    }
}

canvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    const { x: endX, y: endY } = getMousePos(e);

    if (isResizing || isRotating) {
        isDrawing = false;
        isResizing = false;
        isRotating = false;
        activeHandle = null;
        saveState();
        redraw();
        return;
    }

    if (currentTool === 'crop') {
        isDrawing = false;
        isResizing = false;
        activeHandle = null;
        if (cropSelection && Math.abs(cropSelection.w) > 10 && Math.abs(cropSelection.h) > 10) {
            // Normalize cropSelection
            if (cropSelection.w < 0) {
                cropSelection.x += cropSelection.w;
                cropSelection.w = Math.abs(cropSelection.w);
            }
            if (cropSelection.h < 0) {
                cropSelection.y += cropSelection.h;
                cropSelection.h = Math.abs(cropSelection.h);
            }
            document.getElementById('confirm-crop-btn').style.display = 'block';
        } else {
            cropSelection = null;
            redraw();
        }
        return;
    }

    if (['line', 'rect', 'circle', 'arrow', 'textarea', 'polygon'].includes(currentTool)) {
        const newShape = createShape(currentTool, startX, startY, endX, endY, false);
        if (currentTool === 'textarea') {
            if (newShape.w > 10 && newShape.h > 10) {
                initiateTextEdit(newShape, newShape.x, newShape.y, true);
            }
        } else {
            // Only add if it has some size
            const size = (newShape.type === 'circle') ? newShape.r : (newShape.type === 'line' || newShape.type === 'arrow') ?
                Math.sqrt(Math.pow(newShape.x2 - newShape.x1, 2) + Math.pow(newShape.y2 - newShape.y1, 2)) :
                Math.max(newShape.w, newShape.h);

            if (size > 5) {
                shapes.push(newShape);
                selectedShape = newShape;
                updateUIForSelection(newShape);
            }
        }
    }

    if (isDrawing || isResizing) {
        saveState();
    }

    isDrawing = false;
    isResizing = false;
    activeHandle = null;
    updateCursor(endX, endY);
    redraw();
});

canvas.addEventListener('mouseleave', () => {
    updateCursor();
});

canvas.addEventListener('dblclick', (e) => {
    const { x: mouseX, y: mouseY } = getMousePos(e);

    const foundIndex = shapes.slice().reverse().findIndex(s => (s.type === 'text' || s.type === 'textarea') && isPointInShape(mouseX, mouseY, s));
    if (foundIndex !== -1) {
        const actualIndex = shapes.length - 1 - foundIndex;
        initiateTextEdit(shapes[actualIndex]);
    }
});

// Actions
document.getElementById('save-btn').addEventListener('click', () => {
    // Temporarily deselect to avoid handles in screenshot
    const tempSelectedShape = selectedShape;
    selectedShape = null;
    redraw();

    const link = document.createElement('a');
    link.download = 'screencap-' + Date.now() + '.png';
    link.href = canvas.toDataURL();
    link.click();

    // Restore selection
    selectedShape = tempSelectedShape;
    redraw();
});

async function copyToClipboard() {
    // Temporarily deselect to avoid handles in screenshot
    const tempSelectedShape = selectedShape;
    selectedShape = null;
    redraw();

    canvas.toBlob(async (blob) => {
        try {
            const data = [new ClipboardItem({ 'image/png': blob })];
            await navigator.clipboard.write(data);

            // Success feedback
            const btn = document.getElementById('copy-clipboard-btn');
            const originalContent = btn.innerHTML;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="#10b981" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
            setTimeout(() => {
                btn.innerHTML = originalContent;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
            alert('Failed to copy image to clipboard.');
        } finally {
            // Restore selection
            selectedShape = tempSelectedShape;
            redraw();
        }
    }, 'image/png');
}

document.getElementById('copy-clipboard-btn').addEventListener('click', copyToClipboard);

document.getElementById('discard-btn').addEventListener('click', () => {
    if (confirm('Discard this screenshot?')) {
        window.close();
    }
});

// Copy and Paste Logic
document.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in a text input or content editable element
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        copyToClipboard();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        redo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copyShape();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteShape();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedShape) {
            const index = shapes.indexOf(selectedShape);
            if (index !== -1) {
                shapes.splice(index, 1);
                selectedShape = null;
                redraw();
                saveState();
                updateUIForSelection(null);
            }
        }
    } else if (e.key === 'Escape') {
        if (selectedShape) {
            selectedShape = null;
            updateUIForSelection(null);
            redraw();
        }

        // Also close manual modal if open
        const manualModal = document.getElementById('manual-modal');
        if (manualModal && manualModal.style.display === 'flex') {
            manualModal.style.display = 'none';
        }
    } else {
        // Tool Hotkeys
        const key = e.key.toLowerCase();
        const toolMap = {
            's': 'select',
            'p': 'pen',
            'e': 'eraser',
            'r': 'rect',
            'c': 'circle',
            't': 'text',
            'l': 'line',
            'a': 'arrow',
            'g': 'polygon',
            'x': 'crop'
        };

        if (toolMap[key]) {
            const btnId = `tool-${toolMap[key]}-ribbon`;
            const btn = document.getElementById(btnId);
            if (btn) btn.click();
        }
    }
});

function copyShape() {
    if (selectedShape) {
        clipboardShape = JSON.parse(JSON.stringify(selectedShape));
    }
}

function pasteShape() {
    if (!clipboardShape) return;

    const newShape = JSON.parse(JSON.stringify(clipboardShape));
    newShape.name = getUniqueName(newShape.type);

    // Offset the new shape slightly to make it visible
    const offset = 20;
    if (newShape.type === 'line' || newShape.type === 'arrow') {
        newShape.x1 += offset;
        newShape.y1 += offset;
        newShape.x2 += offset;
        newShape.y2 += offset;
    } else if (newShape.type === 'pen') {
        newShape.points.forEach(p => {
            p.x += offset;
            p.y += offset;
        });
    } else {
        newShape.x += offset;
        newShape.y += offset;
    }

    shapes.push(newShape);
    selectedShape = newShape;

    // Update the clipboard shape to the new one so subsequent pastes continue to offset
    clipboardShape = JSON.parse(JSON.stringify(newShape));

    redraw();
    saveState();
    updateUIForSelection(newShape);
}

// User Manual Modal Logic
const manualBtn = document.getElementById('manual-btn');
const manualModal = document.getElementById('manual-modal');
const closeManual = document.getElementById('close-manual');

if (manualBtn && manualModal && closeManual) {
    manualBtn.addEventListener('click', () => {
        manualModal.style.display = 'flex';
    });

    closeManual.addEventListener('click', () => {
        manualModal.style.display = 'none';
    });

    // Close on outside click
    manualModal.addEventListener('click', (e) => {
        if (e.target === manualModal) {
            manualModal.style.display = 'none';
        }
    });
}

// Crop Actions
document.getElementById('confirm-crop-btn').addEventListener('click', () => {
    if (!cropSelection) return;

    // Shift all shapes
    const dx = -cropSelection.x;
    const dy = -cropSelection.y;
    shapes.forEach(shape => moveShape(shape, dx, dy));

    // Update cropData
    if (!cropData) {
        cropData = { x: cropSelection.x, y: cropSelection.y, w: cropSelection.w, h: cropSelection.h };
    } else {
        cropData.x += cropSelection.x;
        cropData.y += cropSelection.y;
        cropData.w = cropSelection.w;
        cropData.h = cropSelection.h;
    }

    // Update canvas size
    canvas.width = cropSelection.w;
    canvas.height = cropSelection.h;

    // Reset tool
    cropSelection = null;
    currentTool = 'select';
    document.querySelectorAll('.ribbon-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tool-select-ribbon').classList.add('active');
    document.getElementById('crop-actions-ribbon').style.display = 'none';

    redraw();
    saveState();
});

document.getElementById('cancel-crop-btn').addEventListener('click', () => {
    cropSelection = null;
    currentTool = 'select';
    document.querySelectorAll('.ribbon-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tool-select-ribbon').classList.add('active');
    document.getElementById('crop-actions-ribbon').style.display = 'none';
    redraw();
});

// History buttons (no longer needed here as they are added in the ribbon section)

// Initial UI state for undo/redo
updateHistoryButtons();
updateLayersList();

// Sidebar toggle logic
if (toggleSidebarBtn && layersSidebar) {
    toggleSidebarBtn.addEventListener('click', () => {
        const isCollapsed = layersSidebar.classList.toggle('collapsed');
        userManuallyCollapsedSidebar = isCollapsed;
    });
}
// Zoom Logic
function setZoom(zoom) {
    // Clamp zoom level
    if (zoom < 0.1) zoom = 0.1;
    if (zoom > 5) zoom = 5;

    // Round to 1 decimal place to avoid floating point issues
    currentZoom = Math.round(zoom * 10) / 10;

    // Apply zoom using CSS 'zoom' property which handles flow layout better than transform
    // and automatically updates getBoundingClientRect without manual math
    canvas.style.zoom = `${currentZoom * 100}%`;

    // Update label
    const zoomLevelDisplay = document.getElementById('zoom-level');
    if (zoomLevelDisplay) {
        zoomLevelDisplay.innerText = `${Math.round(currentZoom * 100)}%`;
    }
}

const btnZoomIn = document.getElementById('zoom-in-btn');
const btnZoomOut = document.getElementById('zoom-out-btn');

if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
        setZoom(currentZoom + 0.1);
    });
}

if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
        setZoom(currentZoom - 0.1);
    });
}

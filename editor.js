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

// UI Control Elements
const thicknessControls = document.getElementById('thickness-controls');
const fontControls = document.getElementById('font-controls');
const fillControlGroup = document.getElementById('fill-control-group');
const radiusControls = document.getElementById('radius-controls');

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
            redraw();
        };
    }
});

function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    if (cropData) {
        ctx.drawImage(img, cropData.x, cropData.y, cropData.w, cropData.h, 0, 0, cropData.w, cropData.h);
    } else {
        ctx.drawImage(img, 0, 0);
    }

    // Draw all shapes
    shapes.forEach(shape => {
        drawShape(shape);
        if (shape === selectedShape) {
            drawSelectionHighlight(shape);
        }
    });
}

function drawShape(shape) {
    ctx.strokeStyle = hexToRGBA(shape.color, shape.strokeOpacity || 1.0);
    ctx.fillStyle = hexToRGBA(shape.fillColor, shape.fillOpacity || 1.0);
    ctx.lineWidth = shape.thickness || 3;
    ctx.lineCap = 'round';
    ctx.beginPath();

    switch (shape.type) {
        case 'line':
            ctx.moveTo(shape.x1, shape.y1);
            ctx.lineTo(shape.x2, shape.y2);
            ctx.stroke();
            break;
        case 'rect':
            if (shape.fillColor && shape.fillColor !== '#ffffff00' && shape.fillColor !== 'transparent') {
                if (shape.borderRadius && (shape.borderRadius.tl || shape.borderRadius.tr || shape.borderRadius.br || shape.borderRadius.bl)) {
                    ctx.beginPath();
                    ctx.roundRect(shape.x, shape.y, shape.w, shape.h, [
                        shape.borderRadius.tl || 0,
                        shape.borderRadius.tr || 0,
                        shape.borderRadius.br || 0,
                        shape.borderRadius.bl || 0
                    ]);
                    ctx.fill();
                } else {
                    ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
                }
            }

            if (shape.borderRadius && (shape.borderRadius.tl || shape.borderRadius.tr || shape.borderRadius.br || shape.borderRadius.bl)) {
                ctx.beginPath();
                ctx.roundRect(shape.x, shape.y, shape.w, shape.h, [
                    shape.borderRadius.tl || 0,
                    shape.borderRadius.tr || 0,
                    shape.borderRadius.br || 0,
                    shape.borderRadius.bl || 0
                ]);
                ctx.stroke();
            } else {
                ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
            }
            break;
        case 'circle':
            ctx.arc(shape.x, shape.y, shape.r, 0, 2 * Math.PI);
            if (shape.fillColor && shape.fillColor !== '#ffffff00' && shape.fillColor !== 'transparent') {
                ctx.fill();
            }
            ctx.stroke();
            break;
        case 'oval':
            ctx.ellipse(shape.x, shape.y, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
            ctx.stroke();
            break;
        case 'arrow':
            drawArrow(shape.x1, shape.y1, shape.x2, shape.y2, ctx, shape.thickness);
            break;
        case 'pen':
            if (shape.points.length < 2) return;
            ctx.moveTo(shape.points[0].x, shape.points[0].y);
            for (let i = 1; i < shape.points.length; i++) {
                ctx.lineTo(shape.points[i].x, shape.points[i].y);
            }
            ctx.stroke();
            break;
        case 'text':
            const fontWeight = shape.bold ? 'bold' : 'normal';
            const fontStyle = shape.italic ? 'italic' : 'normal';
            ctx.font = `${fontStyle} ${fontWeight} ${shape.fontSize || 20}px ${shape.fontFamily || 'Inter, sans-serif'}`;
            ctx.fillStyle = hexToRGBA(shape.color, shape.strokeOpacity || 1.0); // Use shape.color for text
            ctx.textBaseline = 'top';
            const lines = shape.text.split('\n');
            const lineHeight = (shape.fontSize || 20) * 1.2;
            lines.forEach((line, index) => {
                const lx = shape.x;
                const ly = shape.y + (index * lineHeight);
                ctx.fillText(line, lx, ly);

                if (shape.underline) {
                    const metrics = ctx.measureText(line);
                    ctx.beginPath();
                    ctx.strokeStyle = hexToRGBA(shape.color, shape.strokeOpacity || 1.0); // Also ensure stroke color for underline
                    ctx.lineWidth = Math.max(1, (shape.fontSize || 20) / 15);
                    ctx.moveTo(lx, ly + (shape.fontSize || 20));
                    ctx.lineTo(lx + metrics.width, ly + (shape.fontSize || 20));
                    ctx.stroke();
                }
            });
            break;
    }
}

function hexToRGBA(hex, opacity) {
    if (!hex || hex === 'transparent' || hex === '#ffffff00') return 'transparent';
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function drawArrow(x1, y1, x2, y2, context, thickness) {
    const headlen = 10 + (thickness || 3) * 1.5;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const L = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // Shorten the shaft so its rounded end doesn't blunt the sharp tip
    const shaftEndX = L > headlen ? x2 - (headlen * 0.7) * Math.cos(angle) : x1;
    const shaftEndY = L > headlen ? y2 - (headlen * 0.7) * Math.sin(angle) : y1;

    // Draw the arrow shaft
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(shaftEndX, shaftEndY);
    context.stroke();

    // Draw the arrow head (filled triangle)
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 7), y2 - headlen * Math.sin(angle - Math.PI / 7));
    context.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 7), y2 - headlen * Math.sin(angle + Math.PI / 7));
    context.closePath();
    context.fill();
}

function drawSelectionHighlight(shape) {
    ctx.strokeStyle = '#6366f1';
    ctx.fillStyle = '#ffffff';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;

    let bounds = getShapeBounds(shape);
    ctx.strokeRect(bounds.x - 5, bounds.y - 5, bounds.w + 10, bounds.h + 10);
    ctx.setLineDash([]);

    // Draw handles
    const handles = getResizeHandles(bounds);
    Object.values(handles).forEach(h => {
        ctx.fillRect(h.x - RESIZE_HANDLE_SIZE / 2, h.y - RESIZE_HANDLE_SIZE / 2, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
        ctx.strokeRect(h.x - RESIZE_HANDLE_SIZE / 2, h.y - RESIZE_HANDLE_SIZE / 2, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
    });
}

function getResizeHandles(bounds) {
    const { x, y, w, h } = bounds;
    const padding = 5;
    const left = x - padding;
    const right = x + w + padding;
    const top = y - padding;
    const bottom = y + h + padding;
    const midX = x + w / 2;
    const midY = y + h / 2;

    return {
        nw: { x: left, y: top, cursor: 'nwse-resize' },
        n: { x: midX, y: top, cursor: 'ns-resize' },
        ne: { x: right, y: top, cursor: 'nesw-resize' },
        e: { x: right, y: midY, cursor: 'ew-resize' },
        se: { x: right, y: bottom, cursor: 'nwse-resize' },
        s: { x: midX, y: bottom, cursor: 'ns-resize' },
        sw: { x: left, y: bottom, cursor: 'nesw-resize' },
        w: { x: left, y: midY, cursor: 'ew-resize' }
    };
}

function updateCursor(mouseX, mouseY) {
    if (mouseX === undefined || mouseY === undefined) {
        canvas.style.cursor = '';
        return;
    }

    if (currentTool === 'select' || currentTool === 'eraser') {
        const handle = getHandleAtPoint(mouseX, mouseY, selectedShape);
        if (currentTool === 'select' && handle) {
            const bounds = getShapeBounds(selectedShape);
            const handles = getResizeHandles(bounds);
            canvas.style.cursor = handles[handle].cursor;
            canvas.classList.remove('eraser-cursor');
            return;
        }

        const isOverShape = shapes.some(s => isPointInShape(mouseX, mouseY, s));
        if (isOverShape) {
            if (currentTool === 'eraser') {
                canvas.classList.add('eraser-cursor');
            } else {
                canvas.style.cursor = 'grab';
                canvas.classList.remove('eraser-cursor');
            }
        } else {
            canvas.style.cursor = '';
            canvas.classList.remove('eraser-cursor');
        }
    } else {
        canvas.style.cursor = '';
        canvas.classList.remove('eraser-cursor');
    }
}

function getHandleAtPoint(x, y, shape) {
    if (!shape) return null;
    const bounds = getShapeBounds(shape);
    const handles = getResizeHandles(bounds);
    for (const [type, handle] of Object.entries(handles)) {
        if (Math.abs(x - handle.x) <= RESIZE_HANDLE_SIZE / 2 + 2 &&
            Math.abs(y - handle.y) <= RESIZE_HANDLE_SIZE / 2 + 2) {
            return type;
        }
    }
    return null;
}

function getShapeBounds(shape) {
    switch (shape.type) {
        case 'line':
        case 'arrow':
            return {
                x: Math.min(shape.x1, shape.x2),
                y: Math.min(shape.y1, shape.y2),
                w: Math.abs(shape.x1 - shape.x2),
                h: Math.abs(shape.y1 - shape.y2)
            };
        case 'rect':
            return {
                x: Math.min(shape.x, shape.x + shape.w),
                y: Math.min(shape.y, shape.y + shape.h),
                w: Math.abs(shape.w),
                h: Math.abs(shape.h)
            };
        case 'circle':
            return { x: shape.x - shape.r, y: shape.y - shape.r, w: shape.r * 2, h: shape.r * 2 };
        case 'oval':
            return { x: shape.x - shape.rx, y: shape.y - shape.ry, w: shape.rx * 2, h: shape.ry * 2 };
        case 'pen':
            const xs = shape.points.map(p => p.x);
            const ys = shape.points.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            return {
                x: minX,
                y: minY,
                w: Math.max(...xs) - minX,
                h: Math.max(...ys) - minY
            };
        case 'text':
            const fontSize = shape.fontSize || 20;
            const fontFamily = shape.fontFamily || 'Inter, sans-serif';
            ctx.font = `${fontSize}px ${fontFamily}`;
            const lines = shape.text.split('\n');
            const widths = lines.map(line => ctx.measureText(line).width);
            const lineHeight = fontSize * 1.2;
            return {
                x: shape.x,
                y: shape.y,
                w: Math.max(...widths),
                h: lines.length * lineHeight
            };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
}

function isPointInShape(x, y, shape) {
    const bounds = getShapeBounds(shape);
    const padding = 10;
    return x >= bounds.x - padding && x <= bounds.x + bounds.w + padding &&
        y >= bounds.y - padding && y <= bounds.y + bounds.h + padding;
}

// Tool Selection
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.id === 'tool-clear') return;
        const active = document.querySelector('.tool-btn.active');
        if (active) active.classList.remove('active');
        btn.classList.add('active');
        currentTool = btn.id.replace('tool-', '');

        selectedShape = null;
        canvas.className = (currentTool === 'select' || currentTool === 'eraser') ? 'selecting' : '';
        canvas.style.cursor = ''; // Clear inline cursor
        updateCursor(); // Update based on new tool
        redraw();

        const existingInput = document.querySelector('.text-input');
        if (existingInput) existingInput.remove();

        radiusControls.style.display = (currentTool === 'rect') ? 'flex' : 'none';

        updateThicknessInputFromShape(null);
        updateFontInputsFromShape(null);

        if (currentTool === 'rect' || currentTool === 'circle') {
            fillControlGroup.style.display = 'flex';
        } else {
            fillControlGroup.style.display = 'none';
        }

        if (currentTool === 'text') {
            thicknessControls.style.display = 'none';
            fontControls.style.display = 'flex';
        } else {
            thicknessControls.style.display = 'flex';
            fontControls.style.display = 'none';
        }
    });
});

function updateRadiusInputsFromShape(shape) {
    const tl = document.getElementById('radius-tl');
    const tr = document.getElementById('radius-tr');
    const br = document.getElementById('radius-br');
    const bl = document.getElementById('radius-bl');

    if (shape && shape.type === 'rect' && shape.borderRadius) {
        tl.value = shape.borderRadius.tl || 0;
        tr.value = shape.borderRadius.tr || 0;
        br.value = shape.borderRadius.br || 0;
        bl.value = shape.borderRadius.bl || 0;
    } else {
        tl.value = 0;
        tr.value = 0;
        br.value = 0;
        bl.value = 0;
    }
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

    if (shape && shape.type === 'text') {
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
    } else {
        document.getElementById('color-picker').value = currentColor;
        document.getElementById('stroke-opacity').value = Math.round(currentStrokeOpacity * 100);
        document.getElementById('stroke-opacity-val').innerText = `${Math.round(currentStrokeOpacity * 100)}%`;

        document.getElementById('fill-enabled').checked = isFillEnabled;
        document.getElementById('fill-color-picker').value = currentFillColor;
        document.getElementById('fill-opacity').value = Math.round(currentFillOpacity * 100);
        document.getElementById('fill-opacity-val').innerText = `${Math.round(currentFillOpacity * 100)}%`;
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

        if (selectedShape && selectedShape.type === 'text') {
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
['tl', 'tr', 'br', 'bl'].forEach(pos => {
    document.getElementById(`radius-${pos}`).addEventListener('input', (e) => {
        const val = parseInt(e.target.value) || 0;
        if (selectedShape && selectedShape.type === 'rect') {
            if (!selectedShape.borderRadius) selectedShape.borderRadius = {};
            selectedShape.borderRadius[pos] = val;
            redraw();
        }
    });
});

document.getElementById('tool-clear').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all shapes?')) {
        shapes = [];
        selectedShape = null;
        redraw();
    }
});

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
    }
});

document.getElementById('fill-opacity').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) / 100;
    currentFillOpacity = val;
    document.getElementById('fill-opacity-val').innerText = `${e.target.value}%`;
    if (selectedShape && (selectedShape.type === 'rect' || selectedShape.type === 'circle')) {
        selectedShape.fillOpacity = val;
        redraw();
    }
});

document.getElementById('color-picker').addEventListener('input', (e) => {
    currentColor = e.target.value;
    if (selectedShape) {
        selectedShape.color = currentColor;
        redraw();
    }
});

document.getElementById('fill-color-picker').addEventListener('input', (e) => {
    currentFillColor = e.target.value;
    if (selectedShape && (selectedShape.type === 'rect' || selectedShape.type === 'circle') && document.getElementById('fill-enabled').checked) {
        selectedShape.fillColor = currentFillColor;
        redraw();
    }
});

document.getElementById('fill-enabled').addEventListener('change', (e) => {
    isFillEnabled = e.target.checked;
    if (selectedShape && (selectedShape.type === 'rect' || selectedShape.type === 'circle')) {
        selectedShape.fillColor = isFillEnabled ? currentFillColor : '#ffffff00';
        redraw();
    }
});

document.getElementById('font-family').addEventListener('change', (e) => {
    const val = e.target.value;
    currentFontFamily = val;
    if (selectedShape && selectedShape.type === 'text') {
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
    if (selectedShape && selectedShape.type === 'text') {
        selectedShape.fontSize = val;
        redraw();
    }
    const input = document.querySelector('.text-input');
    if (input) {
        input.style.fontSize = `${val}px`;
        input.style.lineHeight = `${val * 1.2}px`;
    }
});

// Drawing Logic
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (currentTool === 'select' || currentTool === 'eraser') {
        const handle = getHandleAtPoint(mouseX, mouseY, selectedShape);
        if (currentTool === 'select' && handle) {
            isResizing = true;
            isDrawing = true; // Added this to trigger mousemove logic
            activeHandle = handle;
            dragStartX = mouseX;
            dragStartY = mouseY;
            return;
        }

        const foundIndex = shapes.slice().reverse().findIndex(s => isPointInShape(mouseX, mouseY, s));
        if (foundIndex !== -1) {
            const actualIndex = shapes.length - 1 - foundIndex;
            if (currentTool === 'select') {
                selectedShape = shapes[actualIndex];
                isDrawing = true;
                dragStartX = mouseX;
                dragStartY = mouseY;
            } else {
                shapes.splice(actualIndex, 1);
                selectedShape = null;
            }
        } else {
            selectedShape = null;
        }
        redraw();
        updateCursor(mouseX, mouseY);

        // Show radius controls if a rectangle is selected OR if Rectangle tool is active
        if ((selectedShape && selectedShape.type === 'rect') || currentTool === 'rect') {
            radiusControls.style.display = 'flex';
            updateRadiusInputsFromShape(selectedShape);
        } else {
            radiusControls.style.display = 'none';
            updateRadiusInputsFromShape(null);
        }

        updateThicknessInputFromShape(selectedShape);
        updateFontInputsFromShape(selectedShape);

        // Update fill picker visibility based on selected shape type
        if (selectedShape && (selectedShape.type === 'rect' || selectedShape.type === 'circle')) {
            fillControlGroup.style.display = 'flex';
        } else if (!selectedShape && (currentTool === 'rect' || currentTool === 'circle')) {
            fillControlGroup.style.display = 'flex';
        } else {
            fillControlGroup.style.display = 'none';
        }

        if (selectedShape && selectedShape.type === 'text') {
            thicknessControls.style.display = 'none';
            fontControls.style.display = 'flex';
        } else if (currentTool !== 'text') {
            thicknessControls.style.display = 'flex';
            fontControls.style.display = 'none';
        }

        return;
    }

    const existingInput = document.querySelector('.text-input');
    if (existingInput) {
        existingInput.blur();
        return;
    }

    if (currentTool === 'text') {
        const foundIndex = shapes.slice().reverse().findIndex(s => s.type === 'text' && isPointInShape(mouseX, mouseY, s));
        if (foundIndex !== -1) {
            const actualIndex = shapes.length - 1 - foundIndex;
            const shapeToEdit = shapes[actualIndex];

            // Initiate editing for existing shape
            const input = document.createElement('div');
            input.className = 'text-input';
            input.contentEditable = true;

            // Get canvas offset to position input correctly in body
            const canvasRect = canvas.getBoundingClientRect();
            input.style.left = `${canvasRect.left + shapeToEdit.x - 5}px`;
            input.style.top = `${canvasRect.top + shapeToEdit.y - 5}px`;

            input.style.color = shapeToEdit.color;
            input.style.fontSize = `${shapeToEdit.fontSize || 20}px`;
            input.style.fontFamily = shapeToEdit.fontFamily || 'Inter, sans-serif';
            input.style.fontWeight = shapeToEdit.bold ? 'bold' : 'normal';
            input.style.fontStyle = shapeToEdit.italic ? 'italic' : 'normal';
            input.style.textDecoration = shapeToEdit.underline ? 'underline' : 'none';
            input.style.lineHeight = `${(shapeToEdit.fontSize || 20) * 1.2}px`;
            input.innerText = shapeToEdit.text;

            // Update global state to match the shape being edited
            currentBold = !!shapeToEdit.bold;
            currentItalic = !!shapeToEdit.italic;
            currentUnderline = !!shapeToEdit.underline;
            currentFontSize = shapeToEdit.fontSize || 20;
            currentFontFamily = shapeToEdit.fontFamily || 'Inter, sans-serif';
            currentColor = shapeToEdit.color;
            document.getElementById('color-picker').value = currentColor;
            updateFontInputsFromShape(null); // Sync toolbar buttons

            // Temporarily remove shape from array while editing
            shapes.splice(actualIndex, 1);
            redraw();

            document.body.appendChild(input);
            setTimeout(() => {
                input.focus();
                // Select all text
                const range = document.createRange();
                range.selectNodeContents(input);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            }, 0);

            const handleFinish = () => {
                const text = input.innerText.trim();
                if (text) {
                    shapeToEdit.text = text;
                    shapeToEdit.color = currentColor;
                    shapeToEdit.fontSize = currentFontSize;
                    shapeToEdit.fontFamily = currentFontFamily;
                    shapeToEdit.bold = currentBold;
                    shapeToEdit.italic = currentItalic;
                    shapeToEdit.underline = currentUnderline;
                    shapes.push(shapeToEdit);
                    redraw();
                }
                input.remove();
            };

            input.addEventListener('blur', handleFinish);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    input.blur();
                }
            });
            return;
        }

        const input = document.createElement('div');
        input.className = 'text-input';
        input.contentEditable = true;
        input.style.left = `${e.clientX}px`;
        input.style.top = `${e.clientY}px`;
        input.style.color = currentColor;
        input.style.fontSize = `${currentFontSize}px`;
        input.style.fontFamily = currentFontFamily;
        input.style.fontWeight = currentBold ? 'bold' : 'normal';
        input.style.fontStyle = currentItalic ? 'italic' : 'normal';
        input.style.textDecoration = currentUnderline ? 'underline' : 'none';
        input.style.lineHeight = `${currentFontSize * 1.2}px`;
        document.body.appendChild(input);

        setTimeout(() => input.focus(), 0);

        const handleFinish = () => {
            const text = input.innerText.trim();
            if (text) {
                shapes.push({
                    type: 'text',
                    x: mouseX + 5, // Account for padding (4px) + border (1px)
                    y: mouseY + 5,
                    text: text,
                    color: currentColor,
                    fontSize: currentFontSize,
                    fontFamily: currentFontFamily,
                    bold: currentBold,
                    italic: currentItalic,
                    underline: currentUnderline
                });
                redraw();
            }
            input.remove();
        };

        input.addEventListener('blur', handleFinish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                input.blur();
            }
        });
        return;
    }

    isDrawing = true;
    startX = mouseX;
    startY = mouseY;

    if (currentTool === 'pen') {
        shapes.push({
            type: 'pen',
            points: [{ x: mouseX, y: mouseY }],
            color: currentColor,
            thickness: currentThickness
        });
    } else if (currentTool === 'eraser') {
        // Eraser in shape-based system is complex if it's supposed to erase parts.
        // For simplicity, let's just not support moving erased parts yet or treat eraser as a special shape.
        // Actually, let's skip eraser for now or keep it as is (which won't work perfectly with redraw).
    } else {
        // Temporary shape for visual feedback will be handled in mousemove
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    updateCursor(currentX, currentY);

    if (!isDrawing) return;

    if (currentTool === 'select' || currentTool === 'eraser') {
        if (currentTool === 'select' && isResizing && selectedShape) {
            const dx = currentX - dragStartX;
            const dy = currentY - dragStartY;
            resizeShape(selectedShape, activeHandle, dx, dy, currentX, currentY);
            dragStartX = currentX;
            dragStartY = currentY;
            redraw();
            return;
        }

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

    if (currentTool === 'pen') {
        shapes[shapes.length - 1].points.push({ x: currentX, y: currentY });
        redraw();
    } else if (['line', 'rect', 'circle', 'arrow'].includes(currentTool)) {
        redraw();
        // Draw the shape being created (not yet in shapes array)
        const tempShape = createShape(currentTool, startX, startY, currentX, currentY);
        drawShape(tempShape);
    }
});

function createShape(type, x1, y1, x2, y2) {
    const fillEnabled = document.getElementById('fill-enabled').checked;
    const shape = {
        type,
        color: currentColor,
        strokeOpacity: currentStrokeOpacity,
        fillColor: (fillEnabled && (type === 'rect' || type === 'circle')) ? currentFillColor : '#ffffff00',
        fillOpacity: (type === 'rect' || type === 'circle') ? currentFillOpacity : 1.0,
        thickness: currentThickness
    };
    switch (type) {
        case 'line':
        case 'arrow':
            shape.x1 = x1; shape.y1 = y1; shape.x2 = x2; shape.y2 = y2;
            break;
        case 'rect':
            shape.x = x1; shape.y = y1; shape.w = x2 - x1; shape.h = y2 - y1;
            shape.borderRadius = {
                tl: parseInt(document.getElementById('radius-tl').value) || 0,
                tr: parseInt(document.getElementById('radius-tr').value) || 0,
                br: parseInt(document.getElementById('radius-br').value) || 0,
                bl: parseInt(document.getElementById('radius-bl').value) || 0
            };
            break;
        case 'circle':
            shape.x = x1; shape.y = y1;
            shape.r = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            break;
    }
    return shape;
}

function resizeShape(shape, handleType, dx, dy, mouseX, mouseY) {
    const bounds = getShapeBounds(shape);

    switch (shape.type) {
        case 'rect': {
            const isWNeg = shape.w < 0;
            const isHNeg = shape.h < 0;

            // Map n/s/w/e to actual properties based on whether they are flipped
            if (handleType.includes('n')) {
                if (!isHNeg) { shape.y += dy; shape.h -= dy; }
                else { shape.h += dy; }
            }
            if (handleType.includes('s')) {
                if (!isHNeg) { shape.h += dy; }
                else { shape.y += dy; shape.h -= dy; }
            }
            if (handleType.includes('w')) {
                if (!isWNeg) { shape.x += dx; shape.w -= dx; }
                else { shape.w += dx; }
            }
            if (handleType.includes('e')) {
                if (!isWNeg) { shape.w += dx; }
                else { shape.x += dx; shape.w -= dx; }
            }
            break;
        }

        case 'oval': {
            // Oval is centered, so resizing one side affects both by half, 
            // but we want the opposite side pinned, so we move center too.
            if (handleType.includes('n')) { shape.y += dy / 2; shape.ry -= dy / 2; }
            if (handleType.includes('s')) { shape.y += dy / 2; shape.ry += dy / 2; }
            if (handleType.includes('w')) { shape.x += dx / 2; shape.rx -= dx / 2; }
            if (handleType.includes('e')) { shape.x += dx / 2; shape.rx += dx / 2; }
            shape.rx = Math.max(1, shape.rx);
            shape.ry = Math.max(1, shape.ry);
            break;
        }

        case 'circle':
            // Convert circle to oval if stretching from side/corner
            shape.type = 'oval';
            shape.rx = shape.r;
            shape.ry = shape.r;
            delete shape.r;
            // Fall through to oval logic
            return resizeShape(shape, handleType, dx, dy, mouseX, mouseY);

        case 'line':
        case 'arrow': {
            const dist1 = Math.sqrt(Math.pow(mouseX - shape.x1, 2) + Math.pow(mouseY - shape.y1, 2));
            const dist2 = Math.sqrt(Math.pow(mouseX - shape.x2, 2) + Math.pow(mouseY - shape.y2, 2));
            if (dist1 < dist2) {
                if (handleType.includes('n') || handleType.includes('s') || handleType.includes('w') || handleType.includes('e')) {
                    if (handleType.includes('w') || handleType.includes('e')) shape.x1 += dx;
                    if (handleType.includes('n') || handleType.includes('s')) shape.y1 += dy;
                }
            } else {
                if (handleType.includes('n') || handleType.includes('s') || handleType.includes('w') || handleType.includes('e')) {
                    if (handleType.includes('w') || handleType.includes('e')) shape.x2 += dx;
                    if (handleType.includes('n') || handleType.includes('s')) shape.y2 += dy;
                }
            }
            break;
        }

        case 'text': {
            const isN = handleType.includes('n');
            const isS = handleType.includes('s');
            const isW = handleType.includes('w');
            const isE = handleType.includes('e');

            let change = 0;
            if (isN) change = -dy;
            else if (isS) change = dy;
            else if (isW) change = -dx;
            else if (isE) change = dx;

            if (change !== 0) {
                const oldSize = shape.fontSize || 20;
                let newSize = oldSize;
                if (isN || isS) {
                    newSize = oldSize + change;
                } else {
                    newSize = oldSize + (change * 0.5);
                }

                shape.fontSize = Math.max(8, Math.min(200, Math.round(newSize)));
                updateFontInputsFromShape(shape);
            }
            break;
        }

        case 'pen': {
            const oldBounds = getShapeBounds(shape);
            const isW = handleType.includes('w');
            const isE = handleType.includes('e');
            const isN = handleType.includes('n');
            const isS = handleType.includes('s');

            let newW = oldBounds.w;
            let newH = oldBounds.h;
            let offsetX = 0;
            let offsetY = 0;

            if (isW) { newW -= dx; offsetX = dx; }
            if (isE) { newW += dx; }
            if (isN) { newH -= dy; offsetY = dy; }
            if (isS) { newH += dy; }

            // Avoid division by zero and excessive scaling
            if (oldBounds.w === 0) newW = 1;
            if (oldBounds.h === 0) newH = 1;
            const scaleX = newW / (oldBounds.w || 1);
            const scaleY = newH / (oldBounds.h || 1);

            shape.points = shape.points.map(p => ({
                x: oldBounds.x + offsetX + (p.x - oldBounds.x) * scaleX,
                y: oldBounds.y + offsetY + (p.y - oldBounds.y) * scaleY
            }));
            break;
        }
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

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    if (['line', 'rect', 'circle', 'arrow'].includes(currentTool)) {
        shapes.push(createShape(currentTool, startX, startY, currentX, currentY));
    }

    isDrawing = false;
    isResizing = false;
    activeHandle = null;
    updateCursor(currentX, currentY);
    redraw();
});

canvas.addEventListener('mouseleave', () => {
    updateCursor();
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

document.getElementById('discard-btn').addEventListener('click', () => {
    if (confirm('Discard this screenshot?')) {
        window.close();
    }
});

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
let img = new Image();
let currentTool = 'select';
let isDrawing = false;
let startX, startY;
let currentColor = '#6366f1';
let currentThickness = 3;
let shapes = [];
let selectedShape = null;
let cropData = null;
let isResizing = false;
let activeHandle = null;
let dragStartX, dragStartY;
const RESIZE_HANDLE_SIZE = 8;

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
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
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
            ctx.font = '20px Inter, sans-serif';
            ctx.textBaseline = 'top';
            const lines = shape.text.split('\n');
            lines.forEach((line, index) => {
                ctx.fillText(line, shape.x, shape.y + (index * 24));
            });
            break;
    }
}

function drawArrow(x1, y1, x2, y2, context, thickness) {
    const headlen = 10 + (thickness || 3) * 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
    context.moveTo(x2, y2);
    context.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    context.stroke();
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
            return;
        }

        const isOverShape = shapes.some(s => isPointInShape(mouseX, mouseY, s));
        if (isOverShape) {
            canvas.style.cursor = currentTool === 'eraser' ? 'crosshair' : 'grab';
        } else {
            canvas.style.cursor = ''; // Let CSS handles .selecting class
        }
    } else {
        canvas.style.cursor = ''; // Let CSS handle crosshair
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
            ctx.font = '20px Inter, sans-serif';
            const lines = shape.text.split('\n');
            const widths = lines.map(line => ctx.measureText(line).width);
            return {
                x: shape.x,
                y: shape.y,
                w: Math.max(...widths),
                h: lines.length * 24
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

        const radiusControls = document.getElementById('radius-controls');
        if (currentTool === 'rect') {
            radiusControls.style.display = 'flex';
            updateRadiusInputsFromShape(null); // Reset to defaults or tool values
        } else {
            radiusControls.style.display = 'none';
        }

        updateThicknessInputFromShape(null);
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
    if (shape && shape.thickness) {
        thicknessInput.value = shape.thickness;
    } else {
        thicknessInput.value = currentThickness;
    }
}

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
    if (selectedShape) {
        selectedShape.thickness = val;
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

        // Show radius controls if a rectangle is selected
        const radiusControls = document.getElementById('radius-controls');
        if (selectedShape && selectedShape.type === 'rect') {
            radiusControls.style.display = 'flex';
            updateRadiusInputsFromShape(selectedShape);
        } else {
            updateRadiusInputsFromShape(null);
        }

        updateThicknessInputFromShape(selectedShape);
        return;
    }

    const existingInput = document.querySelector('.text-input');
    if (existingInput) {
        existingInput.blur();
        return;
    }

    if (currentTool === 'text') {
        const input = document.createElement('div');
        input.className = 'text-input';
        input.contentEditable = true;
        input.style.left = `${e.clientX}px`;
        input.style.top = `${e.clientY}px`;
        input.style.color = currentColor;
        input.style.fontSize = '20px';
        input.style.fontFamily = 'Inter, sans-serif';
        input.style.lineHeight = '24px';
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
                    color: currentColor
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
    } else if (['line', 'rect', 'circle', 'oval', 'arrow'].includes(currentTool)) {
        redraw();
        // Draw the shape being created (not yet in shapes array)
        const tempShape = createShape(currentTool, startX, startY, currentX, currentY);
        drawShape(tempShape);
    }
});

function createShape(type, x1, y1, x2, y2) {
    const shape = { type, color: currentColor, thickness: currentThickness };
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
        case 'oval':
            shape.x = x1 + (x2 - x1) / 2;
            shape.y = y1 + (y2 - y1) / 2;
            shape.rx = Math.abs(x2 - x1) / 2;
            shape.ry = Math.abs(y2 - y1) / 2;
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
        case 'arrow':
            // Logic to move endpoints based on handles
            // This is slightly complex because dragging a handle should move the corresponding endpoint
            // Let's find which endpoint is closer to the handle
            const dist1 = Math.sqrt(Math.pow(mouseX - shape.x1, 2) + Math.pow(mouseY - shape.y1, 2));
            const dist2 = Math.sqrt(Math.pow(mouseX - shape.x2, 2) + Math.pow(mouseY - shape.y2, 2));

            // For bounding box handles, we might want to scale the whole line, 
            // but usually users expect to move endpoints.
            // If dragging corners, we move the nearest endpoint.
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

    if (['line', 'rect', 'circle', 'oval', 'arrow'].includes(currentTool)) {
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
    const link = document.createElement('a');
    link.download = 'screencap-' + Date.now() + '.png';
    link.href = canvas.toDataURL();
    link.click();
});

document.getElementById('discard-btn').addEventListener('click', () => {
    if (confirm('Discard this screenshot?')) {
        window.close();
    }
});

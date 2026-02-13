const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
let img = new Image();
let currentTool = 'select';
let isDrawing = false;
let startX, startY;
let currentColor = '#6366f1';
let shapes = [];
let selectedShape = null;
let dragStartX, dragStartY;

// Load image from storage
chrome.storage.local.get(['capturedImage', 'cropData'], (result) => {
    if (result.capturedImage) {
        img.src = result.capturedImage;
        img.onload = () => {
            if (result.cropData) {
                const crop = result.cropData;
                canvas.width = crop.w;
                canvas.height = crop.h;
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
    chrome.storage.local.get(['cropData'], (result) => {
        if (result.cropData) {
            const crop = result.cropData;
            ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
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
    });
}

function drawShape(shape) {
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();

    switch (shape.type) {
        case 'line':
            ctx.moveTo(shape.x1, shape.y1);
            ctx.lineTo(shape.x2, shape.y2);
            ctx.stroke();
            break;
        case 'rect':
            ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
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
            drawArrow(shape.x1, shape.y1, shape.x2, shape.y2, ctx);
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

function drawArrow(x1, y1, x2, y2, context) {
    const headlen = 15;
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
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;

    let bounds = getShapeBounds(shape);
    ctx.strokeRect(bounds.x - 5, bounds.y - 5, bounds.w + 10, bounds.h + 10);
    ctx.setLineDash([]);
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
            return { x: shape.x, y: shape.y, w: Math.abs(shape.w), h: Math.abs(shape.h) };
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
        const active = document.querySelector('.tool-btn.active');
        if (active) active.classList.remove('active');
        btn.classList.add('active');
        currentTool = btn.id.replace('tool-', '');

        selectedShape = null;
        canvas.className = (currentTool === 'select' || currentTool === 'eraser') ? 'selecting' : '';
        redraw();

        const existingInput = document.querySelector('.text-input');
        if (existingInput) existingInput.remove();
    });
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
            color: currentColor
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
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    if (currentTool === 'select' || currentTool === 'eraser') {
        const isOverShape = shapes.some(s => isPointInShape(currentX, currentY, s));
        canvas.classList.toggle('grabbing', isOverShape);
        canvas.classList.toggle('eraser-cursor', currentTool === 'eraser');

        if (currentTool === 'select' && selectedShape && isDrawing) {
            const dx = currentX - dragStartX;
            const dy = currentY - dragStartY;
            moveShape(selectedShape, dx, dy);
            dragStartX = currentX;
            dragStartY = currentY;
            redraw();
            return;
        }
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
    const shape = { type, color: currentColor };
    switch (type) {
        case 'line':
        case 'arrow':
            shape.x1 = x1; shape.y1 = y1; shape.x2 = x2; shape.y2 = y2;
            break;
        case 'rect':
            shape.x = x1; shape.y = y1; shape.w = x2 - x1; shape.h = y2 - y1;
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
    redraw();
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

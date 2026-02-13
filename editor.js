const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
let img = new Image();
let currentTool = 'pen';
let isDrawing = false;
let startX, startY;
let currentColor = '#6366f1';
let snapshot;

// Load image from storage
chrome.storage.local.get(['capturedImage', 'cropData'], (result) => {
    if (result.capturedImage) {
        img.src = result.capturedImage;
        img.onload = () => {
            if (result.cropData) {
                const crop = result.cropData;
                canvas.width = crop.w;
                canvas.height = crop.h;
                ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
            }
            saveSnapshot();
        };
    }
});

function saveSnapshot() {
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restoreSnapshot() {
    ctx.putImageData(snapshot, 0, 0);
}

// Tool Selection
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.tool-btn.active').classList.remove('active');
        btn.classList.add('active');
        currentTool = btn.id.replace('tool-', '');
    });
});

document.getElementById('color-picker').addEventListener('input', (e) => {
    currentColor = e.target.value;
});

// Drawing Logic
canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (currentTool === 'pen' || currentTool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
    } else {
        saveSnapshot();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    if (currentTool === 'pen') {
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
    } else if (currentTool === 'eraser') {
        const size = 20;
        ctx.save();
        ctx.beginPath();
        ctx.arc(currentX, currentY, size / 2, 0, Math.PI * 2);
        ctx.clip();
        chrome.storage.local.get(['cropData'], (result) => {
            if (result.cropData) {
                const crop = result.cropData;
                ctx.drawImage(img, crop.x + (currentX - size / 2), crop.y + (currentY - size / 2), size, size, currentX - size / 2, currentY - size / 2, size, size);
            } else {
                ctx.drawImage(img, currentX - size / 2, currentY - size / 2, size, size, currentX - size / 2, currentY - size / 2, size, size);
            }
            ctx.restore();
        });
    } else if (currentTool === 'line') {
        restoreSnapshot();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
    } else if (currentTool === 'rect') {
        restoreSnapshot();
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
    } else if (currentTool === 'circle') {
        restoreSnapshot();
        const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
        ctx.beginPath();
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (currentTool === 'oval') {
        restoreSnapshot();
        const centerX = startX + (currentX - startX) / 2;
        const centerY = startY + (currentY - startY) / 2;
        const radiusX = Math.abs(currentX - startX) / 2;
        const radiusY = Math.abs(currentY - startY) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
    }
});

canvas.addEventListener('mouseup', () => {
    isDrawing = false;
    saveSnapshot();
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

export function drawCropOverlay(ctx, selection, canvasWidth, canvasHeight) {
    if (!selection) return;

    // Dim the area outside the selection
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

    // Top
    ctx.fillRect(0, 0, canvasWidth, selection.y);
    // Bottom
    ctx.fillRect(0, selection.y + selection.h, canvasWidth, canvasHeight - (selection.y + selection.h));
    // Left
    ctx.fillRect(0, selection.y, selection.x, selection.h);
    // Right
    ctx.fillRect(selection.x + selection.w, selection.y, canvasWidth - (selection.x + selection.w), selection.h);

    // Draw the selection border
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
    ctx.setLineDash([]); // Reset dash

    // Draw handles
    ctx.fillStyle = '#6366f1';
    const handleSize = 8;
    const handles = [
        { x: selection.x, y: selection.y },
        { x: selection.x + selection.w, y: selection.y },
        { x: selection.x, y: selection.y + selection.h },
        { x: selection.x + selection.w, y: selection.y + selection.h },
        { x: selection.x + selection.w / 2, y: selection.y },
        { x: selection.x + selection.w / 2, y: selection.y + selection.h },
        { x: selection.x, y: selection.y + selection.h / 2 },
        { x: selection.x + selection.w, y: selection.y + selection.h / 2 }
    ];

    handles.forEach(h => {
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    });
}

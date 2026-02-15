export function getResizeHandles(bounds, handleSize = 8) {
    return {
        nw: { x: bounds.x, y: bounds.y, cursor: 'nw-resize' },
        n: { x: bounds.x + bounds.w / 2, y: bounds.y, cursor: 'n-resize' },
        ne: { x: bounds.x + bounds.w, y: bounds.y, cursor: 'ne-resize' },
        w: { x: bounds.x, y: bounds.y + bounds.h / 2, cursor: 'w-resize' },
        e: { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2, cursor: 'e-resize' },
        sw: { x: bounds.x, y: bounds.y + bounds.h, cursor: 'sw-resize' },
        s: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h, cursor: 's-resize' },
        se: { x: bounds.x + bounds.w, y: bounds.y + bounds.h, cursor: 'se-resize' }
    };
}

export function drawSelectionHighlight(ctx, bounds, handleSize = 8) {
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4);
    ctx.setLineDash([]);

    // Draw handles
    ctx.fillStyle = '#6366f1';
    const handles = [
        { x: bounds.x - 2, y: bounds.y - 2 },
        { x: bounds.x + bounds.w / 2, y: bounds.y - 2 },
        { x: bounds.x + bounds.w + 2, y: bounds.y - 2 },
        { x: bounds.x - 2, y: bounds.y + bounds.h / 2 },
        { x: bounds.x + bounds.w + 2, y: bounds.y + bounds.h / 2 },
        { x: bounds.x - 2, y: bounds.y + bounds.h + 2 },
        { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h + 2 },
        { x: bounds.x + bounds.w + 2, y: bounds.y + bounds.h + 2 }
    ];
    handles.forEach(h => ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize));
}

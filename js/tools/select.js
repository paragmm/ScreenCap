export function getResizeHandles(bounds, handleSize = 8, rotation = 0) {
    const handles = {
        nw: { x: bounds.x, y: bounds.y, cursor: 'nw-resize' },
        n: { x: bounds.x + bounds.w / 2, y: bounds.y, cursor: 'n-resize' },
        ne: { x: bounds.x + bounds.w, y: bounds.y, cursor: 'ne-resize' },
        w: { x: bounds.x, y: bounds.y + bounds.h / 2, cursor: 'w-resize' },
        e: { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2, cursor: 'e-resize' },
        sw: { x: bounds.x, y: bounds.y + bounds.h, cursor: 'sw-resize' },
        s: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h, cursor: 's-resize' },
        se: { x: bounds.x + bounds.w, y: bounds.y + bounds.h, cursor: 'se-resize' }
    };

    const rotationHandleOffset = 30;
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;

    // Apply rotation to handles if rotation is present
    if (rotation) {
        for (const key in handles) {
            const h = handles[key];
            const dx = h.x - centerX;
            const dy = h.y - centerY;
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            h.x = centerX + dx * cos - dy * sin;
            h.y = centerY + dx * sin + dy * cos;
        }
    }

    // Add rotation handle
    const rotX = bounds.x + bounds.w / 2;
    const rotY = bounds.y - rotationHandleOffset;

    if (rotation) {
        const dx = rotX - centerX;
        const dy = rotY - centerY;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        handles.rotate = {
            x: centerX + dx * cos - dy * sin,
            y: centerY + dx * sin + dy * cos,
            cursor: 'crosshair'
        };
    } else {
        handles.rotate = { x: rotX, y: rotY, cursor: 'crosshair' };
    }

    return handles;
}

export function drawSelectionHighlight(ctx, bounds, handleSize = 8, rotation = 0) {
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;

    ctx.save();
    if (rotation) {
        ctx.translate(centerX, centerY);
        ctx.rotate(rotation);
        ctx.translate(-centerX, -centerY);
    }

    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4);
    ctx.setLineDash([]);

    // Draw rotation handle line
    const rotationHandleOffset = 30;
    ctx.beginPath();
    ctx.moveTo(bounds.x + bounds.w / 2, bounds.y - 2);
    ctx.lineTo(bounds.x + bounds.w / 2, bounds.y - rotationHandleOffset);
    ctx.stroke();

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
        { x: bounds.x + bounds.w + 2, y: bounds.y + bounds.h + 2 },
        // Rotation handle
        { x: bounds.x + bounds.w / 2, y: bounds.y - rotationHandleOffset }
    ];
    handles.forEach((h, i) => {
        ctx.beginPath();
        if (i === handles.length - 1) {
            // Rotation handle is a circle
            ctx.arc(h.x, h.y, handleSize / 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        }
    });

    ctx.restore();
}

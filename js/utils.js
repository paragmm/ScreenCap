export function hexToRGBA(hex, opacity) {
    if (!hex || hex === 'transparent' || hex === '#ffffff00' || hex === 'none') return 'transparent';
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex[1] + hex[2], 16);
        g = parseInt(hex[3] + hex[4], 16);
        b = parseInt(hex[5] + hex[6], 16);
    } else {
        return hex; // Return as is if it's already a color name or rgba
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function drawArrow(x1, y1, x2, y2, context, thickness) {
    const headlen = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineWidth = thickness;
    context.stroke();

    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
    context.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fillStyle = context.strokeStyle;
    context.fill();
}

export function getShapeBounds(shape) {
    if (shape.type === 'pen') {
        const xs = shape.points.map(p => p.x);
        const ys = shape.points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else if (shape.type === 'line' || shape.type === 'arrow') {
        const x = Math.min(shape.x1, shape.x2);
        const y = Math.min(shape.y1, shape.y2);
        const w = Math.abs(shape.x2 - shape.x1);
        const h = Math.abs(shape.y2 - shape.y1);
        return { x, y, w, h };
    } else if (shape.type === 'circle') {
        return { x: shape.x - shape.r, y: shape.y - shape.r, w: shape.r * 2, h: shape.r * 2 };
    } else if (shape.type === 'oval') {
        return { x: shape.x - shape.rx, y: shape.y - shape.ry, w: shape.rx * 2, h: shape.ry * 2 };
    } else if (shape.type === 'text') {
        // Approximate width/height if not stored
        const width = shape.w || (shape.text.length * (shape.fontSize || 20) * 0.6);
        const height = shape.h || (shape.fontSize || 20) * 1.2;
        return { x: shape.x, y: shape.y, w: width, h: height };
    }
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
}

export function isPointInShape(x, y, shape) {
    const bounds = getShapeBounds(shape);
    const padding = 10;
    return x >= bounds.x - padding && x <= bounds.x + bounds.w + padding &&
        y >= bounds.y - padding && y <= bounds.y + bounds.h + padding;
}

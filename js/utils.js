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
    const headlen = 10 + (thickness || 3) * 1.5;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const L = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    context.lineCap = 'butt';
    context.lineJoin = 'miter';
    context.lineWidth = thickness;

    // Shorten the shaft so its end doesn't blunt the sharp tip
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
    context.fillStyle = context.strokeStyle;
    context.fill();
}

export function getShapeBounds(shape) {
    if (shape.type === 'group') {
        if (!shape.shapes || shape.shapes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
        const allBounds = shape.shapes.map(s => getShapeBounds(s));
        const minX = Math.min(...allBounds.map(b => b.x));
        const minY = Math.min(...allBounds.map(b => b.y));
        const maxX = Math.max(...allBounds.map(b => b.x + b.w));
        const maxY = Math.max(...allBounds.map(b => b.y + b.h));
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
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
    } else if (shape.type === 'polygon') {
        return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    }
    return { x: shape.x || 0, y: shape.y || 0, w: shape.w || 0, h: shape.h || 0 };
}

export function getShapeCenter(shape) {
    if (shape.type === 'circle' || shape.type === 'oval') {
        return { x: shape.x, y: shape.y };
    }
    if (shape.type === 'line' || shape.type === 'arrow') {
        return { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 };
    }
    const bounds = getShapeBounds(shape);
    return {
        x: bounds.x + bounds.w / 2,
        y: bounds.y + bounds.h / 2
    };
}

export function isPointInShape(x, y, shape) {
    let testX = x;
    let testY = y;

    if (shape.rotation) {
        const center = getShapeCenter(shape);
        // Rotate point (x, y) around center by -rotation
        const dx = x - center.x;
        const dy = y - center.y;
        const cos = Math.cos(-shape.rotation);
        const sin = Math.sin(-shape.rotation);
        testX = center.x + dx * cos - dy * sin;
        testY = center.y + dx * sin + dy * cos;
    }

    if (shape.type === 'group') {
        return shape.shapes.some(s => isPointInShape(testX, testY, s));
    }

    const bounds = getShapeBounds(shape);
    const padding = 10;
    return testX >= bounds.x - padding && testX <= bounds.x + bounds.w + padding &&
        testY >= bounds.y - padding && testY <= bounds.y + bounds.h + padding;
}

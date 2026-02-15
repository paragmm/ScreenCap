import { getShapeBounds } from '../utils.js';

export function drawPen(ctx, shape, hexToRGBA) {
    if (!shape.points || shape.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x, shape.points[0].y);
    for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
    }
    ctx.lineWidth = shape.thickness;
    ctx.strokeStyle = hexToRGBA(shape.color, shape.strokeOpacity);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

export function resizePen(shape, handleType, dx, dy) {
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

    if (oldBounds.w === 0) newW = 1;
    if (oldBounds.h === 0) newH = 1;
    const scaleX = newW / (oldBounds.w || 1);
    const scaleY = newH / (oldBounds.h || 1);

    shape.points = shape.points.map(p => ({
        x: oldBounds.x + offsetX + (p.x - oldBounds.x) * scaleX,
        y: oldBounds.y + offsetY + (p.y - oldBounds.y) * scaleY
    }));
}

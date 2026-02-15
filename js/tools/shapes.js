import { drawArrow as drawArrowUtil } from '../utils.js';

export function drawShape(ctx, shape, hexToRGBA) {
    const strokeRGBA = hexToRGBA(shape.color, shape.strokeOpacity);
    const fillRGBA = hexToRGBA(shape.fillColor || '#ffffff00', shape.fillOpacity || 1.0);

    ctx.strokeStyle = strokeRGBA;
    ctx.lineWidth = shape.thickness;
    ctx.fillStyle = fillRGBA;

    switch (shape.type) {
        case 'line':
            ctx.beginPath();
            ctx.moveTo(shape.x1, shape.y1);
            ctx.lineTo(shape.x2, shape.y2);
            ctx.stroke();
            break;
        case 'arrow':
            drawArrowUtil(shape.x1, shape.y1, shape.x2, shape.y2, ctx, shape.thickness);
            break;
        case 'rect':
            ctx.beginPath();
            if (shape.borderRadius) {
                const { tl, tr, bl, br } = shape.borderRadius;
                const x = shape.x, y = shape.y, w = shape.w, h = shape.h;
                ctx.moveTo(x + tl, y);
                ctx.lineTo(x + w - tr, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
                ctx.lineTo(x + w, y + h - br);
                ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
                ctx.lineTo(x + bl, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
                ctx.lineTo(x, y + tl);
                ctx.quadraticCurveTo(x, y, x + tl, y);
            } else {
                ctx.rect(shape.x, shape.y, shape.w, shape.h);
            }
            if (fillRGBA !== 'transparent') ctx.fill();
            ctx.stroke();
            break;
        case 'circle':
            ctx.beginPath();
            ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
            if (fillRGBA !== 'transparent') ctx.fill();
            ctx.stroke();
            break;
        case 'oval':
            ctx.beginPath();
            ctx.ellipse(shape.x, shape.y, shape.rx, shape.ry, 0, 0, Math.PI * 2);
            if (fillRGBA !== 'transparent') ctx.fill();
            ctx.stroke();
            break;
    }
}

export function resizeRect(shape, handleType, dx, dy) {
    const isWNeg = shape.w < 0;
    const isHNeg = shape.h < 0;

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
}

export function resizeOval(shape, handleType, dx, dy) {
    if (handleType.includes('n')) { shape.y += dy / 2; shape.ry -= dy / 2; }
    if (handleType.includes('s')) { shape.y += dy / 2; shape.ry += dy / 2; }
    if (handleType.includes('w')) { shape.x += dx / 2; shape.rx -= dx / 2; }
    if (handleType.includes('e')) { shape.x += dx / 2; shape.rx += dx / 2; }
    shape.rx = Math.max(1, shape.rx);
    shape.ry = Math.max(1, shape.ry);
}

export function resizeLine(shape, handleType, dx, dy, mouseX, mouseY) {
    const dist1 = Math.sqrt(Math.pow(mouseX - shape.x1, 2) + Math.pow(mouseY - shape.y1, 2));
    const dist2 = Math.sqrt(Math.pow(mouseX - shape.x2, 2) + Math.pow(mouseY - shape.y2, 2));
    if (dist1 < dist2) {
        if (handleType.includes('w') || handleType.includes('e')) shape.x1 += dx;
        if (handleType.includes('n') || handleType.includes('s')) shape.y1 += dy;
    } else {
        if (handleType.includes('w') || handleType.includes('e')) shape.x2 += dx;
        if (handleType.includes('n') || handleType.includes('s')) shape.y2 += dy;
    }
}

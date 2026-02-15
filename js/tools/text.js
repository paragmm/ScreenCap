export function drawText(ctx, shape, hexToRGBA) {
    ctx.font = `${shape.italic ? 'italic ' : ''}${shape.bold ? 'bold ' : ''}${shape.fontSize || 20}px ${shape.fontFamily || 'Inter, sans-serif'}`;
    ctx.fillStyle = hexToRGBA(shape.color, shape.strokeOpacity);
    ctx.textBaseline = 'top';

    const lines = shape.text.split('\n');
    const lineHeight = (shape.fontSize || 20) * 1.2;
    lines.forEach((line, i) => {
        ctx.fillText(line, shape.x, shape.y + (i * lineHeight));
    });

    if (shape.underline) {
        const metrics = ctx.measureText(lines[0]);
        ctx.beginPath();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = Math.max(1, (shape.fontSize || 20) / 15);
        ctx.moveTo(shape.x, shape.y + (shape.fontSize || 20));
        ctx.lineTo(shape.x + metrics.width, shape.y + (shape.fontSize || 20));
        ctx.stroke();
    }
}

export function resizeText(shape, handleType, dx, dy, updateFontInputs) {
    const isN = handleType.includes('n');
    const isS = handleType.includes('s');
    const isW = handleType.includes('w');
    const isE = handleType.includes('e');

    let change = 0;
    if (isN) change = -dy;
    else if (isS) change = dy;
    else if (isW) change = -dx;
    else if (isE) change = dx;

    if (change !== 0) {
        const oldSize = shape.fontSize || 20;
        let newSize = oldSize;
        if (isN || isS) {
            newSize = oldSize + change;
        } else {
            newSize = oldSize + (change * 0.5);
        }

        shape.fontSize = Math.max(8, Math.min(200, Math.round(newSize)));
        if (updateFontInputs) updateFontInputs(shape);
    }
}

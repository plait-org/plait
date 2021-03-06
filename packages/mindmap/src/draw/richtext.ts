import { MindmapNode } from '../interfaces/node';
import { drawRichtext, updateForeignObject } from 'richtext';
import { ViewContainerRef } from '@angular/core';
import { getRectangleByNode } from '../utils/graph';
import { BASE } from '../constants';

export function drawMindmapNodeRichtext(node: MindmapNode, viewContainerRef: ViewContainerRef, scale = 1) {
    const { textX, textY, width, height } = getRichtextRectangleByNode(node);
    const classList = [];
    if (node.origin.isRoot) {
        classList.push('root-node');
    }
    return drawRichtext(textX, textY, width, height, node.origin.value, viewContainerRef, classList);
}

export function updateMindmapNodeRichtextLocation(node: MindmapNode, g: SVGGElement, scale = 1) {
    const { textX, textY, width, height } = getRichtextRectangleByNode(node);
    // add BASE * 10， avoid changing lines
    updateForeignObject(g, width + BASE * 10, height, textX, textY);
}

export function getRichtextRectangleByNode(node: MindmapNode, scale = 1) {
    const { x, y, width, height } = getRectangleByNode(node);
    
    const offsetX = node.origin.isRoot ? BASE * 3 : BASE * 2;
    const offsetY = node.origin.isRoot ? BASE * 2 : BASE * 1;

    const textX = (x + offsetX) / scale;
    const textY = (y + offsetY) / scale;
    return { width, height, textX, textY };
}

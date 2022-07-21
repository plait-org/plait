import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { PlaitModule } from 'plait';
import { RichtextModule } from 'richtext';
import { MindmapNodeComponent } from './node.component';
import { PlaitMindmapComponent } from './mindmap.component';

@NgModule({
    declarations: [PlaitMindmapComponent, MindmapNodeComponent],
    imports: [BrowserModule, RichtextModule, PlaitModule],
    exports: [PlaitMindmapComponent, MindmapNodeComponent]
})
export class MindmapModule {}

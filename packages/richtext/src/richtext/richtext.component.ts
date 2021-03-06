import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    HostBinding,
    Input,
    NgZone,
    OnDestroy,
    OnInit,
    Output,
    Renderer2,
} from '@angular/core';
import { withRichtext } from '../plugins/with-richtext';
import { BaseRange, createEditor, Editor, Element, Node, Operation, Range, Transforms } from 'slate';
import { BeforeInputEvent, PlaitChangeEvent } from '../interface/event';
import { RichtextEditor, toSlateRange } from '../plugins/richtext-editor';
import { getDefaultView } from '../utils/dom';
import { EDITOR_TO_ELEMENT, EDITOR_TO_ON_CHANGE, EDITOR_TO_WINDOW, ELEMENT_TO_NODE, IS_FOCUSED, IS_NATIVE_INPUT } from '../utils/weak-maps';
import { withMarks } from '../plugins/with-marks';
import { PlaitCompositionEvent } from '../interface/composition';

const NATIVE_INPUT_TYPES = ['insertText'];

@Component({
    selector: 'plait-richtext',
    templateUrl: './richtext.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlaitRichtextComponent implements OnInit, AfterViewInit, OnDestroy {
    @HostBinding('class') hostClass = 'plait-richtext-container';

    initialized = false;

    isComposing = false;

    eventListeners: (() => void)[] = [];

    @Input()
    plaitValue: Element | undefined;

    @Input()
    plaitReadonly = false;

    @HostBinding('[attr.contenteditable]') 
    get contenteditable() {
        return this.plaitReadonly ? undefined : true;
    }

    @HostBinding('[attr.readonly]')
    get readonlyBinding() {
        return this.plaitReadonly;
    }

    @Output()
    plaitChange: EventEmitter<PlaitChangeEvent> = new EventEmitter();

    @Output()
    plaitBlur: EventEmitter<FocusEvent> = new EventEmitter();

    @Output()
    plaitFocus: EventEmitter<FocusEvent> = new EventEmitter();

    @Output()
    plaitComposition: EventEmitter<PlaitCompositionEvent> = new EventEmitter();

    editor = withMarks(withRichtext(createEditor()));

    get bindValue(): Element {
        return this.editor.children[0] as Element;
    }

    get editable() {
        return this.elementRef.nativeElement;
    }

    constructor(
        public renderer2: Renderer2,
        private ngZone: NgZone,
        private cdr: ChangeDetectorRef,
        private elementRef: ElementRef<HTMLElement>
    ) {}

    ngOnInit(): void {
        if (this.plaitValue) {
            this.editor.children = [this.plaitValue];
        }
    }

    ngAfterViewInit(): void {
        this.initialize();
        this.initialized = true;
    }

    initialize() {
        let window = getDefaultView(this.editable);
        EDITOR_TO_WINDOW.set(this.editor, window);
        EDITOR_TO_ELEMENT.set(this.editor, this.editable);
        ELEMENT_TO_NODE.set(this.editable, this.editor);

        this.ngZone.runOutsideAngular(() => {
            // ??????????????????
            this.addEventListener('beforeinput', (evt: Event) => this.onBeforeInput(evt as BeforeInputEvent));
            this.addEventListener('keydown', (event: Event) => this.onKeydown(event as KeyboardEvent));
            this.addEventListener('compositionstart', (evt: Event) => this.compositionStart(evt as CompositionEvent));
            this.addEventListener('compositionupdate', (evt: Event) => this.compositionUpdate(evt as CompositionEvent));
            this.addEventListener('compositionend', (evt: Event) => this.compositionEnd(evt as CompositionEvent));
            this.addEventListener('focus', (evt: Event) => this.onFocus(evt as FocusEvent));
            this.addEventListener('blur', (evt: Event) => this.onBlur(evt as FocusEvent));
            // ??????????????????
            this.addEventListener(
                'selectionchange',
                () => {
                    if (this.plaitReadonly) {
                        return;
                    }
                    this.toSlateSelection();
                },
                window.document
            );
        });
        // ?????? onChange
        EDITOR_TO_ON_CHANGE.set(this.editor, () => {
            this.onChangeHandle();
        });
    }

    onChangeHandle() {
        this.plaitChange.emit({ value: this.editor.children[0] as Element, operations: this.editor.operations });
        const isValueChange = this.editor.operations.some(op => !Operation.isSelectionOperation(op));
        if (isValueChange) {
            this.cdr.detectChanges();
        }
        if (!IS_NATIVE_INPUT.get(this.editor)) {
            this.toNativeSelection();
        }
        IS_NATIVE_INPUT.set(this.editor, false);
    }

    private onBeforeInput(event: BeforeInputEvent) {
        IS_NATIVE_INPUT.set(this.editor, false);
        const editor = this.editor;
        const { selection } = editor;
        const { inputType: type } = event;
        const data = event.dataTransfer || event.data || undefined;
        // These two types occur while a user is composing text and can't be
        // cancelled. Let them through and wait for the composition to end.
        if (type === 'insertCompositionText' || type === 'deleteCompositionText') {
            return;
        }

        let native = false;

        if (
            NATIVE_INPUT_TYPES.includes(type) &&
            selection &&
            Range.isCollapsed(selection) &&
            !editor.marks
            // Chrome has issues correctly editing the start of nodes: https://bugs.chromium.org/p/chromium/issues/detail?id=1249405
            // When there is an inline element, e.g. a link, and you select
            // right after it (the start of the next node).
        ) {
            native = true;
        }

        if (native) {
            IS_NATIVE_INPUT.set(this.editor, true);
        } else {
            event.preventDefault();
        }

        // COMPAT: If the selection is expanded, even if the command seems like
        // a delete forward/backward command it should delete the selection.
        if (selection && Range.isExpanded(selection) && type.startsWith('delete')) {
            const direction = type.endsWith('Backward') ? 'backward' : 'forward';
            Editor.deleteFragment(editor, { direction });
            return;
        }

        switch (type) {
            case 'deleteByComposition':
            case 'deleteByCut':
            case 'deleteByDrag': {
                Editor.deleteFragment(editor);
                break;
            }

            case 'deleteContent':
            case 'deleteContentForward': {
                Editor.deleteForward(editor);
                break;
            }

            case 'deleteContentBackward': {
                Editor.deleteBackward(editor);
                break;
            }

            case 'deleteEntireSoftLine': {
                Editor.deleteBackward(editor, { unit: 'line' });
                Editor.deleteForward(editor, { unit: 'line' });
                break;
            }

            case 'deleteHardLineBackward': {
                Editor.deleteBackward(editor, { unit: 'block' });
                break;
            }

            case 'deleteSoftLineBackward': {
                Editor.deleteBackward(editor, { unit: 'line' });
                break;
            }

            case 'deleteHardLineForward': {
                Editor.deleteForward(editor, { unit: 'block' });
                break;
            }

            case 'deleteSoftLineForward': {
                Editor.deleteForward(editor, { unit: 'line' });
                break;
            }

            case 'deleteWordBackward': {
                Editor.deleteBackward(editor, { unit: 'word' });
                break;
            }

            case 'deleteWordForward': {
                Editor.deleteForward(editor, { unit: 'word' });
                break;
            }

            case 'insertLineBreak':
            case 'insertParagraph': {
                Editor.insertBreak(editor);
                break;
            }

            case 'insertFromComposition': {
                // just be fired in safari, so insert text from compositionend
                break;
            }
            case 'insertFromDrop':
            case 'insertFromPaste':
            case 'insertFromYank':
            case 'insertReplacementText':
            case 'insertText': {
                // use a weak comparison instead of 'instanceof' to allow
                // programmatic access of paste events coming from external windows
                // like cypress where cy.window does not work realibly
                if (data?.constructor.name === 'DataTransfer') {
                } else if (typeof data === 'string') {
                    Editor.insertText(editor, data);
                }
                break;
            }
        }
    }

    private onKeydown(event: KeyboardEvent) {
        this.editor.keydown(event);
    }

    private compositionStart(event: CompositionEvent) {
        this.isComposing = true;
        this.plaitComposition.emit({ originEvent: event, isComposing: this.isComposing });
    }

    private compositionUpdate(event: CompositionEvent) {
        this.isComposing = true;
        this.plaitComposition.emit({ originEvent: event, isComposing: this.isComposing });
    }

    private compositionEnd(event: CompositionEvent) {
        this.isComposing = false;
        this.plaitComposition.emit({ originEvent: event, isComposing: this.isComposing });
        preventDefaultIME(event, this.editor);
        Editor.insertText(this.editor, event.data);
    }

    private onFocus(event: FocusEvent) {
        IS_FOCUSED.set(this.editor, true);
        this.plaitFocus.emit(event);
    }

    private onBlur(event: FocusEvent) {
        IS_FOCUSED.delete(this.editor);
        this.plaitBlur.emit(event);
    }

    private toNativeSelection() {
        if (this.isComposing) {
            return;
        }
        const window = RichtextEditor.getWindow(this.editor);
        const domSelection = window.getSelection();
        const { selection } = this.editor;
        if (selection && domSelection) {
            try {
                // detect real slate selection
                const slateRange = toSlateRange(this.editor, domSelection, false);
                if (Range.equals(selection, slateRange)) {
                    return;
                }
            } catch (error) {}

            const newDomRange = selection && RichtextEditor.toDOMRange(this.editor, selection);
            if (newDomRange) {
                const isBackward = Range.isBackward(selection);
                if (isBackward) {
                    domSelection.setBaseAndExtent(
                        newDomRange.endContainer,
                        newDomRange.endOffset,
                        newDomRange.startContainer,
                        newDomRange.startOffset
                    );
                } else {
                    domSelection.setBaseAndExtent(
                        newDomRange.startContainer,
                        newDomRange.startOffset,
                        newDomRange.endContainer,
                        newDomRange.endOffset
                    );
                }
                return;
            }
        }
        domSelection?.removeAllRanges();
    }

    private toSlateSelection() {
        if (this.isComposing) {
            return;
        }
        const domSelection = window.getSelection();
        if (domSelection) {
            if (!this.editable.contains(domSelection.anchorNode) || !this.editable.contains(domSelection.focusNode) || this.plaitReadonly) {
                return;
            }
            const slateRange = RichtextEditor.toSlateRange(this.editor, domSelection);
            if (slateRange && this.editor.selection && Range.equals(slateRange, this.editor.selection as BaseRange)) {
                // detect unnormalized native selection
                this.toNativeSelection();
                return;
            }
            Transforms.select(this.editor, slateRange);
            return;
        }
        if (this.editor.selection) {
            Transforms.deselect(this.editor);
        }
    }

    private addEventListener(eventName: string, callback: EventListener, target: HTMLElement | Document = this.editable) {
        this.eventListeners.push(
            this.renderer2.listen(target, eventName, (event: Event) => {
                callback(event);
            })
        );
    }

    trackBy = (index: number, node: Node) => {
        return index;
    };

    ngOnDestroy(): void {
        this.eventListeners.forEach(unlisten => {
            unlisten();
        });
        EDITOR_TO_WINDOW.delete(this.editor);
        EDITOR_TO_ELEMENT.delete(this.editor);
        ELEMENT_TO_NODE.delete(this.editable);
    }
}

/**
 * remove default insert from composition
 * @param text
 */
const preventDefaultIME = (event: Event, editor: RichtextEditor) => {
    const types = ['compositionend', 'insertFromComposition'];
    if (!types.includes(event.type)) {
        return;
    }
    const insertText = (event as CompositionEvent).data;
    const window = RichtextEditor.getWindow(editor);
    const domSelection = window.getSelection();
    // ensure text node insert composition input text
    if (
        domSelection &&
        insertText &&
        domSelection.anchorNode instanceof Text &&
        domSelection.anchorNode.textContent?.endsWith(insertText)
    ) {
        const textNode = domSelection.anchorNode;
        textNode.splitText(textNode.length - insertText.length).remove();
    }
};

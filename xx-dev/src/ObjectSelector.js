import { SelectRenderPass } from './SelectRenderPass.js';

export const SelectionMode = Object.freeze({
    Face: 'Face',
    Object: 'Object'
});

/**
 * Handles selecting and deselecting of objects.
 */
export class ObjectSelector {
    #gpuDevice
    #drawingContext;
    #selectRenderPass;
    #meshData;

    #selectObjectAt;
    #selectionMode;
    #firstSelectedVertex;
    #numSelectedVertices;

    constructor(gpuDevice, drawingContext) {
        this.#gpuDevice = gpuDevice;
        this.#drawingContext = drawingContext;
        this.#selectRenderPass = new SelectRenderPass();

        this.#selectObjectAt = null;
        this.setSelectionMode(SelectionMode.Object);
        this.#firstSelectedVertex = 0;
        this.#numSelectedVertices = 0;
    }

    async init(depthTexture, camera, meshData) {
        this.#meshData = meshData;
        this.#selectRenderPass.init(this.#gpuDevice, depthTexture, camera, meshData);
    }

    /**
     * Updates the object selector with the user's input.
     * 
     * @param {InputState} inputState the user input between the last update and this update
     */
    updateWithInputState(inputState) {
        if (inputState.select == true) {
            const x = Math.round(inputState.selectX);
            const y = Math.round(inputState.selectY);
            if (x >= 0 && x < this.#drawingContext.canvas.width && y >= 0 && y < this.#drawingContext.canvas.height) {
                this.#selectObjectAt = { x: x, y: y };
            }
        }
        if (inputState.selectionModeSwitch) {
            this.setSelectionMode((this.#selectionMode == SelectionMode.Face) ? SelectionMode.Object : SelectionMode.Face);
            this.#selectVerticesFor(-1); // select nothing
        }
    }

    setSelectionMode(newMode) {
        this.#selectionMode = newMode;
        document.getElementById("selection-mode").textContent = this.#selectionMode;
    }

    getSelectionMode() {
        return this.#selectionMode;
    }

    getFirstSelectedVertex() {
        return this.#firstSelectedVertex;
    }

    getNumSelectedVertices() {
        return this.#numSelectedVertices;
    }

    async onRenderFrame() {
        if (this.#selectObjectAt !== null) {
            const x = this.#selectObjectAt.x;
            const y = this.#selectObjectAt.y;
            this.#selectObjectAt = null;
            this.#selectObject(x, y)
        }
    }

    async #selectObject(x, y) {
        // console.log("Selecting object at x=" + x + ",y=" + y);

        const commandEncoder = this.#gpuDevice.createCommandEncoder();
        this.#selectRenderPass.renderFrame(commandEncoder);
        this.#gpuDevice.queue.submit([commandEncoder.finish()]);
        await this.#gpuDevice.queue.onSubmittedWorkDone();

        const triangleId = await this.#selectRenderPass.getSelectedTriangleId(x, y);
        // console.log("Selected triangle: " + triangleId);

        this.#selectVerticesFor(triangleId * 3);
    }

    #selectVerticesFor(selectedVertex) {
        if (selectedVertex < 0) {
            // Nothing selected
            this.#firstSelectedVertex = 0;
            this.#numSelectedVertices = 0;
            return;
        }

        let newFirstSelectedVertex = 0;
        let newNumSelectedVertices = 0;
        if (this.#selectionMode == SelectionMode.Face) {
            newFirstSelectedVertex = selectedVertex;
            newNumSelectedVertices = 3;
        } else {
            for (let m of this.#meshData.meshList) {
                if (selectedVertex >= m.firstVertex && selectedVertex < m.firstVertex + m.vertexCount) {
                    newFirstSelectedVertex = m.firstVertex;
                    newNumSelectedVertices = m.vertexCount;
                    break;
                }
            }
        }

        if (newFirstSelectedVertex == this.#firstSelectedVertex &&
            newNumSelectedVertices == this.#numSelectedVertices) {
            // Was already selected -> unselect
            this.#firstSelectedVertex = 0;
            this.#numSelectedVertices = 0;
        } else {
            this.#firstSelectedVertex = newFirstSelectedVertex;
            this.#numSelectedVertices = newNumSelectedVertices;
        }
    }
}
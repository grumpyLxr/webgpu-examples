import { InputHandler } from './InputHandler.js';
import { Scene } from './Scene.js';
import { Renderer } from './Renderer.js';

function displayErrorMessage(message) {
    const errorElement = document.getElementById("error-message");
    errorElement.style.display = "block";
    errorElement.textContent = message;
}

async function initGpuDevice() {
    // 1: request adapter and device
    if (!navigator.gpu) {
        displayErrorMessage();
        throw Error('WebGPU not supported.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw Error('Couldn\'t request WebGPU adapter.');
    }

    const device = await adapter.requestDevice();
    return device;
}

async function initDrawingContext(gpuDevice) {
    // 2: Get reference to the canvas to render on
    const canvas = document.querySelector('#gpu-canvas');
    const context = canvas.getContext('webgpu');

    context.configure({
        device: gpuDevice,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'premultiplied'
    });

    return context
}

async function main() {
    try {
        const gpuDevice = await initGpuDevice();
        const drawingContext = await initDrawingContext(gpuDevice);

        const scene = new Scene();
        const renderer = new Renderer(gpuDevice, scene, drawingContext);
        const inputHandler = new InputHandler(drawingContext.canvas)

        await renderer.init()
        setInterval(() => {
            // Only render if the current browser tab is active.
            if (!document.hidden) {
                renderer.renderFrame()
            }
        }, 20);
        setInterval(() => {
            const inputState = inputHandler.getInputState();
            scene.updateScene(inputState)
        }, 10);
    } catch (e) {
        displayErrorMessage(e)
        document.getElementById("main-div").style.display = 'none';
        throw e;
    }
}

main();

import { InputHandler } from './InputHandler.js';
import { Scene } from './Scene.js';
import { Renderer } from './Renderer.js';

async function initGpuDevice() {
    // 1: request adapter and device
    if (!navigator.gpu) {
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
    const gpuDevice = await initGpuDevice();
    const drawingContext = await initDrawingContext(gpuDevice);

    const scene = new Scene();
    const renderer = new Renderer(gpuDevice, scene);
    const inputHandler = new InputHandler(drawingContext.canvas)

    await renderer.init()
    setInterval(() => renderer.renderFrame(drawingContext), 16);

    setInterval(() => {
        const inputState = inputHandler.getInputState();
        scene.updateScene(inputState)
    }, 10);
}

main();

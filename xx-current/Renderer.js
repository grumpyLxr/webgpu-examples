import {
    mat4,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';
import { Scene } from './Scene.js';

// Clear color for GPURenderPassDescriptor
const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 };

export class Renderer {
    #scene;
    #gpuDevice;
    #context;

    /**
     * Creates a new Renderer to render the given scene.
     * @param {GPUDevice} gpuDevice 
     * @param {Scene} scene 
     */
    constructor(gpuDevice, scene) {
        this.#scene = scene
        this.#gpuDevice = gpuDevice
    }

    async init() {
        // Create a shader module from the shader source code
        const shaders = await this.#loadShaders();
        const shaderModule = this.#gpuDevice.createShaderModule({
            code: shaders
        });

        // Create vertex buffer to contain vertex data of the mesh
        const mesh = this.#scene.getMesh()
        const meshVertices = mesh.getVertices();
        const vertexBuffer = this.#gpuDevice.createBuffer({
            size: meshVertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.#gpuDevice.queue.writeBuffer(vertexBuffer, 0, meshVertices, 0, meshVertices.length);

        // Create an index buffer for the faces of the mesh
        const triangles = mesh.getTriangles();
        const indexBuffer = this.#gpuDevice.createBuffer({
            size: triangles.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        this.#gpuDevice.queue.writeBuffer(indexBuffer, 0, triangles, 0, triangles.length);

        // Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
        const vertexBuffers = [{
            attributes: [{
                shaderLocation: 0, // position
                offset: 0,
                format: 'float32x4'
            }, {
                shaderLocation: 1, // color
                offset: 16,
                format: 'float32x4'
            }],
            arrayStride: 32,
            stepMode: 'vertex'
        }];

        const pipelineDescriptor = {
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex_main',
                buffers: vertexBuffers
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragment_main',
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat()
                }]
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back', // Backface culling
            },
            layout: 'auto'
        };

        // Create the actual render pipeline
        const renderPipeline = this.#gpuDevice.createRenderPipeline(pipelineDescriptor);

        // Create a uniform buffer for the MVP (Model-View-Projection) matrix
        const mvpMatrixBuffer = this.#gpuDevice.createBuffer({
            size: 4 * 16, // 4x4 matrix
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const mvpMatrixBindGroup = this.#gpuDevice.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: mvpMatrixBuffer },
                }
            ]
        });

        this.#context = {
            pipeline: renderPipeline,
            mvpMatrixBuffer, mvpMatrixBuffer,
            mvpMatrixBindGroup: mvpMatrixBindGroup,
            vertexBuffer: vertexBuffer,
            indexBuffer: indexBuffer,
            indexCount: mesh.getTriangleCount() * 3
        }
    }

    /**
     * Renders the next frame.
     * @param {GPUCanvasContext} drawingContext the canvas on which the frame is drawn
     */
    renderFrame(drawingContext) {
        // Create MVP (Model-View-Projection) matrix
        const camera = this.#scene.getCamera();
        const vpMatrix = camera.getViewProjectionMatrix(drawingContext.canvas);
        const modelMatrix = this.#scene.getMeshModelMatrix();
        const mvpMatrix = mat4.multiply(vpMatrix, modelMatrix);

        this.#gpuDevice.queue.writeBuffer(
            this.#context.mvpMatrixBuffer,
            0,
            mvpMatrix.buffer,
            mvpMatrix.byteOffset,
            mvpMatrix.byteLength
        );

        // Create GPUCommandEncoder to issue commands to the GPU
        // Note: render pass descriptor, command encoder, etc. are destroyed after use, fresh one needed for each frame.
        const commandEncoder = this.#gpuDevice.createCommandEncoder();

        // Create GPURenderPassDescriptor to tell WebGPU which texture to draw into, then initiate render pass
        const renderPassDescriptor = {
            colorAttachments: [{
                clearValue: clearColor,
                loadOp: 'clear',
                storeOp: 'store',
                view: drawingContext.getCurrentTexture().createView()
            }]
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

        // Draw the mesh
        passEncoder.setPipeline(this.#context.pipeline);
        passEncoder.setBindGroup(0, this.#context.mvpMatrixBindGroup);
        passEncoder.setVertexBuffer(0, this.#context.vertexBuffer);
        passEncoder.setIndexBuffer(this.#context.indexBuffer, "uint16");
        passEncoder.drawIndexed(this.#context.indexCount);

        // End the render pass
        passEncoder.end();

        // End frame by passing array of command buffers to command queue for execution
        this.#gpuDevice.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Loads vertex and fragment shaders.
     * @returns a String containing the shader definition
     */
    async #loadShaders() {
        var host = window.location.protocol + "//" + window.location.host;
        const response = await fetch(host + '/shaders.wgsl', { cache: "no-store" });
        const data = await response.text();
        return data;
    }
}
import {
    vec3,
    mat3,
    mat4,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';
import { Scene } from './Scene.js';

// Clear color for GPURenderPassDescriptor
const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 };

const vec3ByteLength = vec3.create().byteLength
const mat3ByteLength = mat3.create().byteLength
const mat4ByteLength = mat4.create().byteLength

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

        // Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
        const vertexBuffers = [{
            attributes: [{
                shaderLocation: 0, // position
                offset: 0,
                format: 'float32x3'
            }, {
                shaderLocation: 1, // normal
                offset: 12,
                format: 'float32x3'
            }, {
                shaderLocation: 2, // color
                offset: 24,
                format: 'float32x3'
            },
            {
                shaderLocation: 3, // specularStrength
                offset: 36,
                format: 'float32'
            },
            {
                shaderLocation: 4, // specularShininess
                offset: 40,
                format: 'float32'
            }],
            arrayStride: 44,
            stepMode: 'vertex'
        }];

        // Create a uniform buffer for the MVP (Model-View-Projection) matrix
        var mvpMatrixBufferLength = 2 * mat4ByteLength + mat3ByteLength + vec3ByteLength;
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        mvpMatrixBufferLength = Math.ceil(mvpMatrixBufferLength / 16) * 16;
        const mvpMatrixBuffer = this.#gpuDevice.createBuffer({
            size: mvpMatrixBufferLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create a uniform buffer for the Light
        var lightBufferLength = this.#scene.getLight().getLightData().byteLength;
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        lightBufferLength = Math.ceil(lightBufferLength / 16) * 16;
        const lightBuffer = this.#gpuDevice.createBuffer({
            size: lightBufferLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const uniformBindGroupLayout = this.#gpuDevice.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform",
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform",
                    }
                },
            ],
        });
        const uniformBindGroup = this.#gpuDevice.createBindGroup({
            layout: uniformBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: mvpMatrixBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: lightBuffer },
                },
            ]
        });

        const pipelineLayout = this.#gpuDevice.createPipelineLayout({ bindGroupLayouts: [uniformBindGroupLayout] });
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
            layout: pipelineLayout
        };
        // Create the actual render pipeline
        const renderPipeline = this.#gpuDevice.createRenderPipeline(pipelineDescriptor);

        this.#context = {
            pipeline: renderPipeline,
            mvpMatrixBuffer: mvpMatrixBuffer,
            lightBuffer: lightBuffer,
            uniformBindGroup: uniformBindGroup,
            vertexBuffer: vertexBuffer,
            vertexCount: mesh.getVertexCount(),
        }
    }

    /**
     * Renders the next frame.
     * @param {GPUCanvasContext} drawingContext the canvas on which the frame is drawn
     */
    renderFrame(drawingContext) {
        // Pass MVP (Model/View/Projection) matrices to the shader:
        const camera = this.#scene.getCamera();
        const vpMatrix = camera.getViewProjectionMatrix(drawingContext.canvas);
        const modelMatrix = this.#scene.getMeshModelMatrix();
        // The normal vectors cannot be multiplied with the model matrix. If the model matrix 
        // performs non-uniform scaling, the normals would not be perpendicular to the surface anymore.
        // See http://www.lighthouse3d.com/tutorials/glsl-12-tutorial/the-normal-matrix/
        const normalMatrix = mat3.fromMat4(mat4.transpose(mat4.inverse(modelMatrix)));
        const cameraPosition = camera.getPosition();

        this.#gpuDevice.queue.writeBuffer(
            this.#context.mvpMatrixBuffer,
            0,
            vpMatrix.buffer,
            vpMatrix.byteOffset,
            vpMatrix.byteLength
        );

        this.#gpuDevice.queue.writeBuffer(
            this.#context.mvpMatrixBuffer,
            vpMatrix.byteLength,
            modelMatrix.buffer,
            modelMatrix.byteOffset,
            modelMatrix.byteLength
        );
        this.#gpuDevice.queue.writeBuffer(
            this.#context.mvpMatrixBuffer,
            vpMatrix.byteLength + modelMatrix.byteLength,
            normalMatrix.buffer,
            normalMatrix.byteOffset,
            normalMatrix.byteLength
        );
        this.#gpuDevice.queue.writeBuffer(
            this.#context.mvpMatrixBuffer,
            vpMatrix.byteLength + modelMatrix.byteLength + normalMatrix.byteLength,
            cameraPosition.buffer,
            cameraPosition.byteOffset,
            cameraPosition.byteLength
        );

        // Pass Light data to the shader:
        const light = this.#scene.getLight();
        const lightBytes = light.getLightData();
        this.#gpuDevice.queue.writeBuffer(
            this.#context.lightBuffer,
            0,
            lightBytes.buffer,
            lightBytes.byteOffset,
            lightBytes.byteLength
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
        passEncoder.setBindGroup(0, this.#context.uniformBindGroup);
        passEncoder.setVertexBuffer(0, this.#context.vertexBuffer);
        passEncoder.draw(this.#context.vertexCount);

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
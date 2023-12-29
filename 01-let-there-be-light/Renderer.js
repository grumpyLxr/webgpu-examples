import {
    mat3,
    mat4,
} from './imports/wgpu-matrix.module.js';
import * as utils from './utils.js';
import { Scene } from './Scene.js';

// Clear color for GPURenderPassDescriptor
const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 };

export class Renderer {
    #scene;
    #gpuDevice;
    #drawingContext;
    #context;

    /**
     * Creates a new Renderer to render the given scene.
     * @param {GPUDevice} gpuDevice 
     * @param {Scene} scene 
     * @param {GPUCanvasContext} drawingContext the canvas on which the frame is drawn
     */
    constructor(gpuDevice, scene, drawingContext) {
        this.#scene = scene
        this.#gpuDevice = gpuDevice
        this.#drawingContext = drawingContext;
    }

    async init() {
        const gpuDevice = this.#gpuDevice;

        // Create a shader module from the shader source code
        const shaders = await this.#loadShaders();
        const shaderModule = this.#gpuDevice.createShaderModule({
            code: shaders
        });

        // Create vertex buffer to contain vertex data of the mesh
        const meshList = this.#scene.getMeshes()
        const vbByteSize = meshList.map(m => m.getVertices().byteLength).reduce((a, b) => a + b, 0);
        const vertexBuffer = gpuDevice.createBuffer({
            size: vbByteSize,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        var meshData = []
        var vbOffset = 0;
        var firstVertex = 0;
        for (let mesh of meshList) {
            const meshVertices = mesh.getVertices();
            utils.copyToBuffer(gpuDevice, vertexBuffer, meshVertices, vbOffset);
            meshData.push({
                vertexCount: mesh.getVertexCount(),
                firstVertex: firstVertex
            });
            firstVertex += mesh.getVertexCount();
            vbOffset += meshVertices.byteLength;
        }

        // Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
        const vertexBufferLayout = [{
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


        const pipelineDescriptor = {
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex_main',
                buffers: vertexBufferLayout
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
            layout: 'auto',
            // Enable depth testing so that the fragment closest to the camera is rendered in front.
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            },
        };
        // Create the actual render pipeline
        const renderPipeline = gpuDevice.createRenderPipeline(pipelineDescriptor);

        const depthTexture = gpuDevice.createTexture({
            size: [this.#drawingContext.canvas.width, this.#drawingContext.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Create a uniform buffer for the VP (View-Projection) matrix
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        const cameraBuffer = gpuDevice.createBuffer({
            size: utils.align(utils.mat4ByteLength + utils.vec3ByteLength, 16),
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const cameraBindGroup = utils.createBindGroup(gpuDevice, renderPipeline, 0, [
            { buffer: cameraBuffer },
        ]);
        const cameraData = {
            bindGroup: cameraBindGroup,
            setVpMatrix: function (m) { utils.copyToBuffer(gpuDevice, cameraBuffer, m); },
            setCameraPosition: function (p) { utils.copyToBuffer(gpuDevice, cameraBuffer, p, utils.mat4ByteLength); }
        }

        // Create uniform buffer and BindGroups for the model matrics:
        var modelMatrixStructByteLength = utils.mat4ByteLength + utils.mat3ByteLength;
        const modelMatricesBuffer = gpuDevice.createBuffer({
            size: utils.align(modelMatrixStructByteLength, 256) * meshList.length,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const modelMatrices = []
        var bindGroupOffset = 0;
        for (let mesh of meshList) {
            const bindGroup = utils.createBindGroup(gpuDevice, renderPipeline, 1, [{
                buffer: modelMatricesBuffer, offset: bindGroupOffset, size: modelMatrixStructByteLength
            }]);
            modelMatrices.push({
                bufferOffset: bindGroupOffset,
                bindGroup: bindGroup,
                getModelMatrix: function () { return mesh.getModelMatrix(); },
                setModelMatrix: function (m) {
                    utils.copyToBuffer(gpuDevice, modelMatricesBuffer, m, this.bufferOffset);
                },
                setNormalMatrix: function (m) {
                    utils.copyToBuffer(gpuDevice, modelMatricesBuffer, m, this.bufferOffset + utils.mat4ByteLength);
                }
            });
            bindGroupOffset += utils.align(modelMatrixStructByteLength, 256);
        }

        // Create a uniform buffer for the Light
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        const lights = this.#scene.getLights()
        const lightByteLengths = utils.align(lights[0].getLightData().byteLength, 16);
        const lightBuffer = gpuDevice.createBuffer({
            size: lightByteLengths * lights.length,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const lightBindGroup = utils.createBindGroup(gpuDevice, renderPipeline, 2, [
            { buffer: lightBuffer }
        ]);
        const lightData = {
            bindGroup: lightBindGroup,
            setLight: function (i, light) {
                utils.copyToBuffer(gpuDevice, lightBuffer, light, i * lightByteLengths);
            },
        }

        this.#context = {
            pipeline: renderPipeline,
            depthTexture: depthTexture,

            camera: cameraData,
            lights: lightData,

            vertexBuffer: vertexBuffer,
            meshList: meshData,
            modelMatrices: modelMatrices,
        }
    }

    /**
     * Renders the next frame.
     */
    renderFrame() {
        // Pass MVP (Model/View/Projection) matrices to the shader:
        const camera = this.#scene.getCamera();
        const vpMatrix = camera.getViewProjectionMatrix(this.#drawingContext.canvas);
        const cameraPosition = camera.getPosition();
        const gpuCamera = this.#context.camera;
        gpuCamera.setVpMatrix(vpMatrix);
        gpuCamera.setCameraPosition(cameraPosition);

        // Pass Light data to the shader:
        const lights = this.#scene.getLights();
        const gpuLights = this.#context.lights;
        for (let i = 0; i < lights.length; ++i) {
            gpuLights.setLight(i, lights[i].getLightData())
        }

        for (let m of this.#context.modelMatrices) {
            const modelMatrix = m.getModelMatrix();
            // The normal vectors cannot be multiplied with the model matrix. If the model matrix 
            // performs non-uniform scaling, the normals would not be perpendicular to the surface anymore.
            // See http://www.lighthouse3d.com/tutorials/glsl-12-tutorial/the-normal-matrix/
            const normalMatrix = mat3.fromMat4(mat4.transpose(mat4.inverse(modelMatrix)));
            m.setModelMatrix(modelMatrix);
            m.setNormalMatrix(normalMatrix);
        }

        // Create GPUCommandEncoder to issue commands to the GPU
        // Note: render pass descriptor, command encoder, etc. are destroyed after use, fresh one needed for each frame.
        const commandEncoder = this.#gpuDevice.createCommandEncoder();

        // Create GPURenderPassDescriptor to tell WebGPU which texture to draw into, then initiate render pass
        const renderPassDescriptor = {
            colorAttachments: [{
                clearValue: clearColor,
                loadOp: 'clear',
                storeOp: 'store',
                view: this.#drawingContext.getCurrentTexture().createView()
            }],
            depthStencilAttachment: {
                view: this.#context.depthTexture.createView(),

                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            }
        };

        // Draw the meshes
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.#context.pipeline);
        passEncoder.setVertexBuffer(0, this.#context.vertexBuffer);
        passEncoder.setBindGroup(gpuCamera.bindGroup.number, gpuCamera.bindGroup.group);
        passEncoder.setBindGroup(gpuLights.bindGroup.number, gpuLights.bindGroup.group);

        for (let i = 0; i < this.#context.meshList.length; ++i) {
            const bindGroup = this.#context.modelMatrices[i].bindGroup;
            passEncoder.setBindGroup(bindGroup.number, bindGroup.group);

            const mesh = this.#context.meshList[i];
            passEncoder.draw(mesh.vertexCount, 1, mesh.firstVertex);
        }

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
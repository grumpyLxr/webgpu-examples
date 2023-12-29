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
        const shaders = await this.#loadShaders('standard-shaders.wgsl');
        const shaderModule = this.#gpuDevice.createShaderModule({ code: shaders });

        const wireframeShaders = await this.#loadShaders('wireframe-shaders.wgsl');
        const wireframeShaderModule = this.#gpuDevice.createShaderModule({ code: wireframeShaders });

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
        const vertexBufferLayout = [meshList[0].getVertexLayout()];

        const totalNumVertices = meshList.map(m => m.getVertexCount()).reduce((a, b) => a + b, 0);
        const wireframeIndexBuffer = this.#gpuDevice.createBuffer({
            size: totalNumVertices * 2 * utils.u16ByteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        let wireframeIndexBufferContent = []
        for (var i = 0; i < totalNumVertices; i += 3) {
            wireframeIndexBufferContent.push(i);
            wireframeIndexBufferContent.push(i + 1);
            wireframeIndexBufferContent.push(i + 1);
            wireframeIndexBufferContent.push(i + 2);
            wireframeIndexBufferContent.push(i + 2);
            wireframeIndexBufferContent.push(i);
        }
        utils.copyToBuffer(gpuDevice, wireframeIndexBuffer, new Uint16Array(wireframeIndexBufferContent));

        // Create the standard render pipeline that is used for normal rendering.
        const standardPipelineDescriptor = {
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex_main',
                buffers: vertexBufferLayout
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragment_main',
                targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
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
        const standardRenderPipeline = gpuDevice.createRenderPipeline(standardPipelineDescriptor);

        // Create the render pipeline that is used draw lines such as wireframes and normals.
        const wireframePipelineDescriptor = {
            vertex: {
                module: wireframeShaderModule,
                entryPoint: 'vertex_main',
                buffers: vertexBufferLayout
            },
            fragment: {
                module: wireframeShaderModule,
                entryPoint: 'fragment_main',
                targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
            },
            primitive: {
                topology: 'line-list',
            },
            layout: 'auto',
            // Enable depth testing so that the fragment closest to the camera is rendered in front.
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
                format: 'depth24plus',
            },
        };
        const wireframeRenderPipeline = gpuDevice.createRenderPipeline(wireframePipelineDescriptor);

        const depthTexture = gpuDevice.createTexture({
            size: [this.#drawingContext.canvas.width, this.#drawingContext.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Create a sampler with linear filtering
        const sampler = gpuDevice.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: "repeat",
            addressModeV: "repeat",
        });
        // Load Images and create textures:
        const colorBitmap = await this.#loadImage('checkboard-color.png');
        const colorTexture = utils.createTextureFromBitmap(gpuDevice, colorBitmap);
        const specularBitmap = await this.#loadImage('checkboard-specular.png');
        const specularTexture = utils.createTextureFromBitmap(gpuDevice, specularBitmap, 'r');
        const normalBitmap = await this.#loadImage('checkboard-normal.png');
        const normalTexture = utils.createTextureFromBitmap(gpuDevice, normalBitmap);


        // Create a uniform buffer for the VP (View-Projection) matrix
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        const cameraBuffer = gpuDevice.createBuffer({
            size: utils.align(utils.mat4ByteLength + utils.vec3ByteLength + 3 * utils.i32ByteLength, 16),
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const standardUniformBindGroup = utils.createBindGroup(gpuDevice, standardRenderPipeline, 0, [
            { buffer: cameraBuffer },
            sampler,
            colorTexture.createView(),
            specularTexture.createView(),
            normalTexture.createView(),
        ]);
        const wireframeUniformBindGroup = utils.createBindGroup(gpuDevice, wireframeRenderPipeline, 0, [
            { buffer: cameraBuffer }
        ]);
        const cameraData = {
            standardBindGroup: standardUniformBindGroup,
            wireframeBindGroup: wireframeUniformBindGroup,
            setVpMatrix: function (m) { utils.copyToBuffer(gpuDevice, cameraBuffer, m); },
            setCameraPosition: function (p) { utils.copyToBuffer(gpuDevice, cameraBuffer, p, utils.mat4ByteLength); },
            setUseColorTexture: function (v) {
                const data = new Int32Array([v]);
                utils.copyToBuffer(
                    gpuDevice, cameraBuffer, data, utils.mat4ByteLength + utils.vec3ByteLength
                );
            },
            setUseSpecularTexture: function (v) {
                const data = new Int32Array([v]);
                utils.copyToBuffer(
                    gpuDevice, cameraBuffer, data, utils.mat4ByteLength + utils.vec3ByteLength + utils.i32ByteLength
                );
            },
            setUseNormalTexture: function (v) {
                const data = new Int32Array([v]);
                utils.copyToBuffer(
                    gpuDevice, cameraBuffer, data, utils.mat4ByteLength + utils.vec3ByteLength + 2 * utils.i32ByteLength
                );
            },
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
            const bindGroupEntries = [{
                buffer: modelMatricesBuffer, offset: bindGroupOffset, size: modelMatrixStructByteLength
            }]
            const standardBindGroup = utils.createBindGroup(gpuDevice, standardRenderPipeline, 1, bindGroupEntries);
            const wireframeBindGroup = utils.createBindGroup(gpuDevice, wireframeRenderPipeline, 1, bindGroupEntries);
            modelMatrices.push({
                bufferOffset: bindGroupOffset,
                standardBindGroup: standardBindGroup,
                wireframeBindGroup: wireframeBindGroup,
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

        const standardLightBindGroup = utils.createBindGroup(gpuDevice, standardRenderPipeline, 2, [
            { buffer: lightBuffer }
        ]);
        const lightData = {
            standardBindGroup: standardLightBindGroup,
            setLight: function (i, light) {
                utils.copyToBuffer(gpuDevice, lightBuffer, light, i * lightByteLengths);
            },
        }

        this.#context = {
            standardPipeline: standardRenderPipeline,
            wireframePipeline: wireframeRenderPipeline,
            depthTexture: depthTexture,

            camera: cameraData,
            lights: lightData,

            vertexBuffer: vertexBuffer,
            wireframeIndexBuffer: wireframeIndexBuffer,
            meshList: meshData,
            modelMatrices: modelMatrices,
        }
    }

    /**
     * Renders the next frame.
     */
    renderFrame() {
        const gpuCamera = this.#context.camera;
        const gpuLights = this.#context.lights;
        this.#updateGpuData(gpuCamera, gpuLights);

        // Create GPUCommandEncoder to issue commands to the GPU
        // Note: render pass descriptor, command encoder, etc. are destroyed after use, fresh one needed for each frame.
        const commandEncoder = this.#gpuDevice.createCommandEncoder();

        this.#renderStandardPipeline(
            commandEncoder,
            gpuCamera.standardBindGroup,
            this.#context.modelMatrices.map(m => m.standardBindGroup),
            gpuLights.standardBindGroup
        );

        this.#renderWireframePipeline(
            commandEncoder,
            gpuCamera.wireframeBindGroup,
            this.#context.modelMatrices.map(m => m.wireframeBindGroup),
            gpuLights.wireframeBindGroup
        );

        // End frame by passing array of command buffers to command queue for execution
        this.#gpuDevice.queue.submit([commandEncoder.finish()]);
    }

    #renderStandardPipeline(commandEncoder, cameraBindGroup, modelMatricesBindGroups, lightsBindGroup) {
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
        passEncoder.setPipeline(this.#context.standardPipeline);
        passEncoder.setVertexBuffer(0, this.#context.vertexBuffer);
        passEncoder.setBindGroup(cameraBindGroup.number, cameraBindGroup.group);
        passEncoder.setBindGroup(lightsBindGroup.number, lightsBindGroup.group);

        for (let i = 0; i < this.#context.meshList.length; ++i) {
            const bindGroup = modelMatricesBindGroups[i];
            passEncoder.setBindGroup(bindGroup.number, bindGroup.group);

            const mesh = this.#context.meshList[i];
            passEncoder.draw(mesh.vertexCount, 1, mesh.firstVertex);
        }

        // End the render pass
        passEncoder.end();
    }

    #renderWireframePipeline(commandEncoder, cameraBindGroup, modelMatricesBindGroups, lightsBindGroup) {
        const renderPassDescriptor = {
            colorAttachments: [{
                clearValue: [0, 0, 0, 1],
                loadOp: 'load',
                storeOp: 'store',
                view: this.#drawingContext.getCurrentTexture().createView()
            }],
            depthStencilAttachment: {
                view: this.#context.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'load',
                depthStoreOp: 'discard',
            }
        };

        // Draw the meshes
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.#context.wireframePipeline);
        passEncoder.setVertexBuffer(0, this.#context.vertexBuffer);
        passEncoder.setIndexBuffer(this.#context.wireframeIndexBuffer, "uint16");
        passEncoder.setBindGroup(cameraBindGroup.number, cameraBindGroup.group);

        for (let i = 0; i < this.#context.meshList.length; ++i) {
            const bindGroup = modelMatricesBindGroups[i];
            passEncoder.setBindGroup(bindGroup.number, bindGroup.group);

            const mesh = this.#context.meshList[i];
            passEncoder.drawIndexed(mesh.vertexCount * 2, 1, mesh.firstVertex * 2);
        }

        // End the render pass
        passEncoder.end();
    }

    #updateGpuData(gpuCamera, gpuLights) {
        // Pass MVP (Model/View/Projection) matrices to the shader:
        const camera = this.#scene.getCamera();
        const vpMatrix = camera.getViewProjectionMatrix(this.#drawingContext.canvas);
        const cameraPosition = camera.getPosition();
        gpuCamera.setVpMatrix(vpMatrix);
        gpuCamera.setCameraPosition(cameraPosition);
        gpuCamera.setUseColorTexture(camera.getRenderColorTexture());
        gpuCamera.setUseSpecularTexture(camera.getRenderSpecularTexture());
        gpuCamera.setUseNormalTexture(camera.getRenderNormalTexture());

        // Pass Light data to the shader:
        const lights = this.#scene.getLights();
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
    }

    /**
     * Loads vertex and fragment shaders.
     * @returns a String containing the shader definition
     */
    async #loadShaders(fileName) {
        var host = window.location.protocol + "//" + window.location.host;
        const response = await fetch(host + '/' + fileName, { cache: "no-store" });
        const data = await response.text();
        return data;
    }

    async #loadImage(fileName) {
        var host = window.location.protocol + "//" + window.location.host;
        const response = await fetch(host + '/assets/' + fileName, { cache: "no-store" });
        const bitmap = await createImageBitmap(
            await response.blob(), { colorSpaceConversion: 'none' }
        );
        return bitmap;
    }
}
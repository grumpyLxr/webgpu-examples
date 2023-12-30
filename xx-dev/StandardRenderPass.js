import * as utils from './utils.js';

export class StandardRenderPass {
    #renderPipeline;
    #depthTexture;
    #uniformsBindGroup;
    #meshData;
    #modelMatrixBindGroups;
    #lightsBindGroup;

    async init(gpuDevice, depthTexture, camera, lights, meshData) {
        this.#depthTexture = depthTexture;
        this.#meshData = meshData;

        // Create a shader module from the shader source code
        const shaders = await utils.loadShaders('standard-shaders.wgsl');
        const shaderModule = gpuDevice.createShaderModule({ code: shaders });

        // Create the standard render pipeline that is used for normal rendering.
        this.#renderPipeline = gpuDevice.createRenderPipeline({
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex_main',
                buffers: meshData.vertexBufferLayout
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
        });

        // Create a sampler with linear filtering
        const sampler = gpuDevice.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: "repeat",
            addressModeV: "repeat",
        });
        // Load Images and create textures:
        const colorBitmap = await utils.loadImage('checkboard-color.png');
        const colorTexture = utils.createTextureFromBitmap(gpuDevice, colorBitmap);
        const specularBitmap = await utils.loadImage('checkboard-specular.png');
        const specularTexture = utils.createTextureFromBitmap(gpuDevice, specularBitmap, 'r');
        const normalBitmap = await utils.loadImage('checkboard-normal.png');
        const normalTexture = utils.createTextureFromBitmap(gpuDevice, normalBitmap);

        this.#uniformsBindGroup = utils.createBindGroup(gpuDevice, this.#renderPipeline, 0, [
            { buffer: camera.buffer },
            sampler,
            colorTexture.createView(),
            specularTexture.createView(),
            normalTexture.createView(),
        ]);

        // Create BindGroups for the model matrics:
        this.#modelMatrixBindGroups = []
        for (let mMatrix of meshData.modelMatrices) {
            const bg = utils.createBindGroup(gpuDevice, this.#renderPipeline, 1, [{
                buffer: mMatrix.buffer, offset: mMatrix.bufferOffset, size: mMatrix.byteLength
            }]);
            this.#modelMatrixBindGroups.push(bg);
        }

        this.#lightsBindGroup = utils.createBindGroup(gpuDevice, this.#renderPipeline, 2, [
            { buffer: lights.buffer }
        ]);
    }

    /**
     * Renders the next frame.
     */
    renderFrame(drawingContext, commandEncoder) {
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                clearValue: { r: 0.0, g: 0.5, b: 1.0, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
                view: drawingContext.getCurrentTexture().createView()
            }],
            depthStencilAttachment: {
                view: this.#depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            }
        });

        passEncoder.setPipeline(this.#renderPipeline);
        passEncoder.setVertexBuffer(0, this.#meshData.vertexBuffer);
        passEncoder.setBindGroup(this.#uniformsBindGroup.number, this.#uniformsBindGroup.group);
        passEncoder.setBindGroup(this.#lightsBindGroup.number, this.#lightsBindGroup.group);

        // Draw the meshes
        const meshList = this.#meshData.meshList;
        for (let i = 0; i < meshList.length; ++i) {
            const bindGroup = this.#modelMatrixBindGroups[i];
            passEncoder.setBindGroup(bindGroup.number, bindGroup.group);

            const mesh = meshList[i];
            passEncoder.draw(mesh.vertexCount, 1, mesh.firstVertex);
        }

        // End the render pass
        passEncoder.end();
    }

}
import * as utils from './utils.js';

export const TextureRenderMode = Object.freeze({
    Normal: { name: 'Normal', value: 0 },
    Disabled: { name: 'Disabled', value: 1 },
    Exclusive: { name: 'Exclusive', value: 2 },
});

/**
 * The standard render pass the renders the scene with lights, textures, etc.
 */
export class StandardRenderPass {
    #renderPipeline;
    #depthTexture;
    #uniformsBindGroup;
    #meshData;
    #modelMatrixBindGroups;
    #lightsBindGroup;
    #gpuRenderOptions;

    #colorTextureMode = TextureRenderMode.Normal;
    #specularTextureMode = TextureRenderMode.Normal;
    #normalTextureMode = TextureRenderMode.Normal;

    getColorTextureMode() {
        return this.#colorTextureMode;
    }

    setColorTextureMode(value) {
        this.#colorTextureMode = value;
    }

    getSpecularTextureMode() {
        return this.#specularTextureMode;
    }

    setSpecularTextureMode(value) {
        this.#specularTextureMode = value;
    }

    getNormalTextureMode() {
        return this.#normalTextureMode;
    }

    setNormalTextureMode(value) {
        this.#normalTextureMode = value;
    }

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

        // Create a uniform buffer for the VP (View-Projection) matrix
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        const renderOptionsBuffer = gpuDevice.createBuffer({
            size: utils.align(3 * utils.i32ByteLength, 16),
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.#gpuRenderOptions = {
            buffer: renderOptionsBuffer,
            setColorTextureMode: function (v) {
                utils.copyToBuffer(gpuDevice, this.buffer, new Int32Array([v]), 0);
            },
            setSpecularTextureMode: function (v) {
                utils.copyToBuffer(gpuDevice, this.buffer, new Int32Array([v]), utils.i32ByteLength);
            },
            setNormalTextureMode: function (v) {
                utils.copyToBuffer(gpuDevice, this.buffer, new Int32Array([v]), 2 * utils.i32ByteLength);
            },
        }

        // Create BindGroup for uniforms.
        this.#uniformsBindGroup = utils.createBindGroup(gpuDevice, this.#renderPipeline, 0, [
            { buffer: camera.buffer },
            sampler,
            colorTexture.createView(),
            specularTexture.createView(),
            normalTexture.createView(),
            { buffer: renderOptionsBuffer },
        ]);

        // Create BindGroups for the model matrics.
        this.#modelMatrixBindGroups = meshData.modelMatrices.map(
            m => m.createBindGroup(this.#renderPipeline, 1)
        );

        // Create a BindGroup for the lights.
        this.#lightsBindGroup = utils.createBindGroup(gpuDevice, this.#renderPipeline, 2, [
            { buffer: lights.buffer }
        ]);
    }

    /**
     * Renders the next frame.
     * 
     * @param {GPUCanvasContext} drawingContext the canvas on which the frame is drawn
     * @param {GPUCommandEncoder} commandEncoder the command encoder to send commands to the GPU
     */
    renderFrame(drawingContext, commandEncoder) {
        this.#gpuRenderOptions.setColorTextureMode(this.#colorTextureMode.value);
        this.#gpuRenderOptions.setSpecularTextureMode(this.#specularTextureMode.value);
        this.#gpuRenderOptions.setNormalTextureMode(this.#normalTextureMode.value);

        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
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
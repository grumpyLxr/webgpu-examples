import * as utils from './utils.js';

const MAX_UNIT32 = Math.pow(2, 32) - 1;

/**
 * Render pass to find out which object was select.
 * This is used when the user has clicked somewhere on the screen to find
 * out which object is below the mouse cursor.
 */
export class SelectRenderPass {
    #renderPipeline;
    #depthTexture;
    #uniformsBindGroup;
    #meshData;
    #modelMatrixBindGroups;

    #triangleIdTexture;
    #triangleIdBuffer;

    async init(gpuDevice, depthTexture, camera, meshData) {
        this.#depthTexture = depthTexture;
        this.#meshData = meshData;

        const shaderFile = await utils.loadShaders('select-shaders.wgsl');
        const shaderModule = gpuDevice.createShaderModule({ code: shaderFile });

        this.#triangleIdTexture = gpuDevice.createTexture({
            size: [depthTexture.width, depthTexture.height, 1],
            format: 'r32uint',
            label: 'Triangle Id Texture',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        this.#triangleIdBuffer = gpuDevice.createBuffer({
            size: this.#triangleIdTexture.width * this.#triangleIdTexture.height * utils.u32ByteLength,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        this.#renderPipeline = gpuDevice.createRenderPipeline({
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex_main',
                buffers: meshData.vertexBufferLayout
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragment_main',
                targets: [{ format: this.#triangleIdTexture.format }]
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back', // Backface culling
            },
            layout: 'auto',
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            },
        });

        this.#uniformsBindGroup = utils.createBindGroup(gpuDevice, this.#renderPipeline, 0, [
            { buffer: camera.buffer }
        ]);

        // Create BindGroups for the model matrics:
        this.#modelMatrixBindGroups = []
        for (let mMatrix of meshData.modelMatrices) {
            const bg = utils.createBindGroup(gpuDevice, this.#renderPipeline, 1, [{
                buffer: mMatrix.buffer, offset: mMatrix.bufferOffset, size: mMatrix.byteLength
            }]);
            this.#modelMatrixBindGroups.push(bg);
        }
    }

    /**
     * Renders the next frame.
     * 
     * @param {GPUCommandEncoder} commandEncoder the command encoder to send commands to the GPU
     */
    renderFrame(commandEncoder) {
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                clearValue: [MAX_UNIT32, 0, 0, 0],
                loadOp: 'clear',
                storeOp: 'store',
                view: this.#triangleIdTexture.createView()
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

        // Draw the meshes
        const meshList = this.#meshData.meshList;
        for (let i = 0; i < meshList.length; ++i) {
            const bindGroup = this.#modelMatrixBindGroups[i];
            passEncoder.setBindGroup(bindGroup.number, bindGroup.group);

            const mesh = meshList[i];
            passEncoder.draw(mesh.vertexCount, 1, mesh.firstVertex);
        }

        passEncoder.end();

        // Copy the texture that contains the triangleIds to a GPU buffer that
        // later be read from.
        commandEncoder.copyTextureToBuffer(
            { texture: this.#triangleIdTexture },
            {
                buffer: this.#triangleIdBuffer,
                bytesPerRow: this.#triangleIdTexture.width * utils.u32ByteLength
            },
            {
                width: this.#triangleIdTexture.width,
                height: this.#triangleIdTexture.height,
                depthOrArrayLayers: 1,
            });
    }

    async getSelectedTriangleId(x, y) {
        // Map the triangleIdBuffer so that it can be read from the CPU.
        await this.#triangleIdBuffer.mapAsync(GPUMapMode.READ);

        // Get the entire buffer
        // TODO: This can be optimized to only get a part of the buffer. This is not
        // straightforward because the offset has to be a multiple of 8.
        const ids = new Uint32Array(this.#triangleIdBuffer.getMappedRange());

        const bufferPosition = this.#triangleIdTexture.width * y + x;
        let id = ids[bufferPosition];
        if (id == MAX_UNIT32) {
            // Nothing was selected.
            id = -1;
        }

        this.#triangleIdBuffer.unmap();

        return id;
    }
}
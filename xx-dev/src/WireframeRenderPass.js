import * as utils from './utils.js';

export class WireframeRenderPass {
    #renderPipeline;
    #depthTexture;
    #uniformsBindGroup;
    #wireframeIndexBuffer;
    #meshData;
    #modelMatrixBindGroups;

    async init(gpuDevice, depthTexture, camera, meshData) {
        this.#depthTexture = depthTexture;
        this.#meshData = meshData;

        const shaderFile = await utils.loadShaders('wireframe-shaders.wgsl');
        const shaderModule = gpuDevice.createShaderModule({ code: shaderFile });

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
                topology: 'line-list',
            },
            layout: 'auto',
            // Enable depth testing so that only those wireframes are rendered that are not occluded.
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
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

        this.#wireframeIndexBuffer = this.#createIndexBuffer(gpuDevice, meshData.meshList);
    }

    #createIndexBuffer(gpuDevice, meshList) {
        const totalNumVertices = meshList.map(m => m.vertexCount).reduce((a, b) => a + b, 0);
        const buffer = gpuDevice.createBuffer({
            size: totalNumVertices * 2 * utils.u16ByteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        let content = []
        for (var i = 0; i < totalNumVertices; i += 3) {
            content.push(i);
            content.push(i + 1);
            content.push(i + 1);
            content.push(i + 2);
            content.push(i + 2);
            content.push(i);
        }
        utils.copyToBuffer(gpuDevice, buffer, new Uint16Array(content));
        return buffer;
    }

    /**
     * Renders the next frame.
     */
    renderFrame(drawingContext, commandEncoder) {
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                clearValue: [0, 0, 0, 1],
                loadOp: 'load',
                storeOp: 'store',
                view: drawingContext.getCurrentTexture().createView()
            }],
            depthStencilAttachment: {
                view: this.#depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'load',
                depthStoreOp: 'discard',
            }
        });

        passEncoder.setPipeline(this.#renderPipeline);
        passEncoder.setVertexBuffer(0, this.#meshData.vertexBuffer);
        passEncoder.setIndexBuffer(this.#wireframeIndexBuffer, "uint16");
        passEncoder.setBindGroup(this.#uniformsBindGroup.number, this.#uniformsBindGroup.group);

        // Draw the meshes
        const meshList = this.#meshData.meshList;
        for (let i = 0; i < meshList.length; ++i) {
            const bindGroup = this.#modelMatrixBindGroups[i];
            passEncoder.setBindGroup(bindGroup.number, bindGroup.group);

            const mesh = meshList[i];
            passEncoder.drawIndexed(mesh.vertexCount * 2, 1, mesh.firstVertex * 2);
        }

        // End the render pass
        passEncoder.end();
    }
}
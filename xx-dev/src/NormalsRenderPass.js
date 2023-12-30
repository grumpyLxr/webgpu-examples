import * as utils from './utils.js';

/**
 * Render pass that renders normals, tangents and bitangent.
 */
export class NormalsRenderPass {
    #renderPipeline;
    #depthTexture;
    #uniformsBindGroup;
    #vertexTypeVertexBuffer;
    #meshData;
    #modelMatrixBindGroups;

    async init(gpuDevice, depthTexture, camera, meshData) {
        this.#depthTexture = depthTexture;
        this.#meshData = meshData;

        const shaderFile = await utils.loadShaders('normal-shaders.wgsl');
        const shaderModule = gpuDevice.createShaderModule({ code: shaderFile });

        // Create a vertex buffer that contains the vertex types that should be drawn.
        const typeBufferStruct = this.#createVertexTypeBuffer(gpuDevice);
        this.#vertexTypeVertexBuffer = typeBufferStruct.buffer;
        const vertexBufferLayout = structuredClone(meshData.vertexBufferLayout);
        vertexBufferLayout[0].stepMode = "instance";
        vertexBufferLayout.push(typeBufferStruct.layout);

        this.#renderPipeline = gpuDevice.createRenderPipeline({
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
    }

    #createVertexTypeBuffer(gpuDevice) {
        const buffer = gpuDevice.createBuffer({
            size: 2 * utils.i32ByteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        let content = [0, 1]
        utils.copyToBuffer(gpuDevice, buffer, new Int32Array(content));

        const layout = {
            attributes: [{
                shaderLocation: 15, // vertex type
                offset: 0,
                format: 'sint32'
            }],
            arrayStride: 4,
            stepMode: 'vertex'
        };
        return { buffer: buffer, layout: layout };
    }

    /**
     * Renders the next frame.
     * 
     * @param {GPUCanvasContext} drawingContext the canvas on which the frame is drawn
     * @param {GPUCommandEncoder} commandEncoder the command encoder to send commands to the GPU
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
                depthLoadOp: 'clear',
                depthStoreOp: 'discard',
            }
        });

        passEncoder.setPipeline(this.#renderPipeline);
        passEncoder.setVertexBuffer(0, this.#meshData.vertexBuffer);
        passEncoder.setVertexBuffer(1, this.#vertexTypeVertexBuffer);
        passEncoder.setBindGroup(this.#uniformsBindGroup.number, this.#uniformsBindGroup.group);

        // Draw the normals of the meshes.
        const meshList = this.#meshData.meshList;
        for (let i = 0; i < meshList.length; ++i) {
            const bindGroup = this.#modelMatrixBindGroups[i];
            passEncoder.setBindGroup(bindGroup.number, bindGroup.group);

            const mesh = meshList[i];
            passEncoder.draw(2, mesh.vertexCount, 0, mesh.firstVertex);
        }

        passEncoder.end();
    }
}
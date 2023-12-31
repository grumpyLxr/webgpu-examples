import * as utils from './utils.js';

const LineType = Object.freeze({
    Normal: 1,
    Tangent: 2,
    Bitangent: 3,
});

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
                buffers: vertexBufferLayout,
                constants: {
                    LINE_LENGTH: 0.25,
                    NORMAL_VERTEXT_TYPE: LineType.Normal,
                    TANGENT_VERTEXT_TYPE: LineType.Tangent,
                    BITANGENT_VERTEXT_TYPE: LineType.Bitangent,
                }
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
            size: 6 * utils.i32ByteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        let content = [
            (LineType.Normal << 16) | 0,
            (LineType.Normal << 16) | LineType.Normal,
            (LineType.Tangent << 16) | 0,
            (LineType.Tangent << 16) | LineType.Tangent,
            (LineType.Bitangent << 16) | 0,
            (LineType.Bitangent << 16) | LineType.Bitangent
        ]
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
     * @param {number} firstVertexToDraw the first vertex for which to draw the normal
     * @param {number} numVerticesToDraw the number of vertices for which to draw the normal
     * @param {boolean} drawTangents true to also draw the tangent and bitangent that is used for normal maps
     */
    renderFrame(drawingContext, commandEncoder, firstVertexToDraw, numVerticesToDraw, drawTangents = false) {
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
                depthStoreOp: 'store',
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
            const firstVertex = Math.max(firstVertexToDraw, mesh.firstVertex);
            const lastVertex = Math.min(firstVertexToDraw + numVerticesToDraw, mesh.firstVertex + mesh.vertexCount);
            if (lastVertex <= firstVertex) {
                continue;
            }

            passEncoder.draw(drawTangents ? 6 : 2, lastVertex - firstVertex, 0, firstVertex);
        }

        passEncoder.end();
    }
}
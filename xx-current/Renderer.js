import {
    mat3,
    mat4,
} from './imports/wgpu-matrix.module.js';
import * as utils from './WebGpuUtils.js';
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
        // Create a shader module from the shader source code
        const shaders = await this.#loadShaders();
        const shaderModule = this.#gpuDevice.createShaderModule({
            code: shaders
        });

        // Create vertex buffer to contain vertex data of the mesh
        const meshes = this.#scene.getMeshes()
        const vbByteSize = meshes.map(m => m.getVertices().byteLength).reduce((a, b) => a + b, 0);
        const vertexBuffer = this.#gpuDevice.createBuffer({
            size: vbByteSize,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        var vbOffset = 0;
        for (let mesh of meshes) {
            const meshVertices = mesh.getVertices();
            this.#gpuDevice.queue.writeBuffer(vertexBuffer, vbOffset, meshVertices, 0, meshVertices.length);
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

        // Create Uniform Buffer and BindGroups for the model matrics:
        var modelMatrixByteLength = utils.mat4ByteLength + utils.mat3ByteLength;
        var modelMatricesBufferLength = utils.align(modelMatrixByteLength, 256) * meshes.length;
        const modelMatricesBuffer = this.#gpuDevice.createBuffer({
            size: modelMatricesBufferLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const modelMatricesBindGroupLayout = this.#gpuDevice.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "uniform",
                    }
                }
            ],
        });
        const meshData = []
        var bindGroupOffset = 0;
        for (let mesh of meshes) {
            const meshBindGroup = this.#gpuDevice.createBindGroup({
                layout: modelMatricesBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: modelMatricesBuffer,
                            offset: bindGroupOffset,
                            size: modelMatrixByteLength,
                        },
                    }
                ]
            });
            bindGroupOffset += utils.align(modelMatrixByteLength, 256)
            meshData.push({
                bindGroup: meshBindGroup,
                getModelMatrix: function () { return mesh.getModelMatrix(); },
                getVertexCount: function () { return mesh.getVertexCount() },
            })
        }

        // Create a uniform buffer for the VP (View-Projection) matrix
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        let uniformBufferLength = utils.align(utils.mat4ByteLength + utils.vec3ByteLength, 16);
        const uniformBuffer = this.#gpuDevice.createBuffer({
            size: uniformBufferLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create a uniform buffer for the Light
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        var lightBufferLength = utils.align(this.#scene.getLight().getLightData().byteLength, 16)
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
                    resource: { buffer: uniformBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: lightBuffer },
                },
            ]
        });

        const pipelineLayout = this.#gpuDevice.createPipelineLayout({
            bindGroupLayouts: [uniformBindGroupLayout, modelMatricesBindGroupLayout]
        });
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
            layout: pipelineLayout,
            // Enable depth testing so that the fragment closest to the camera
            // is rendered in front.
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            },
        };
        // Create the actual render pipeline
        const renderPipeline = this.#gpuDevice.createRenderPipeline(pipelineDescriptor);

        const depthTexture = this.#gpuDevice.createTexture({
            size: [this.#drawingContext.canvas.width, this.#drawingContext.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.#context = {
            depthTexture: depthTexture,
            pipeline: renderPipeline,
            uniformBuffer: uniformBuffer,
            lightBuffer: lightBuffer,
            uniformBindGroup: uniformBindGroup,
            meshData: meshData,
            modelMatricesBuffer: modelMatricesBuffer,
            vertexBuffer: vertexBuffer,
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

        this.#gpuDevice.queue.writeBuffer(
            this.#context.uniformBuffer,
            0,
            vpMatrix.buffer,
            vpMatrix.byteOffset,
            vpMatrix.byteLength
        );

        this.#gpuDevice.queue.writeBuffer(
            this.#context.uniformBuffer,
            vpMatrix.byteLength,
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


        var modelMatricesBufferOffset = 0;
        for (let meshData of this.#context.meshData) {
            const modelMatrix = meshData.getModelMatrix();
            // The normal vectors cannot be multiplied with the model matrix. If the model matrix 
            // performs non-uniform scaling, the normals would not be perpendicular to the surface anymore.
            // See http://www.lighthouse3d.com/tutorials/glsl-12-tutorial/the-normal-matrix/
            const normalMatrix = mat3.fromMat4(mat4.transpose(mat4.inverse(modelMatrix)));
            this.#gpuDevice.queue.writeBuffer(
                this.#context.modelMatricesBuffer,
                modelMatricesBufferOffset,
                modelMatrix.buffer,
                modelMatrix.byteOffset,
                modelMatrix.byteLength
            );
            modelMatricesBufferOffset += modelMatrix.byteLength;
            this.#gpuDevice.queue.writeBuffer(
                this.#context.modelMatricesBuffer,
                modelMatricesBufferOffset,
                normalMatrix.buffer,
                normalMatrix.byteOffset,
                normalMatrix.byteLength
            );
            modelMatricesBufferOffset = utils.align(
                modelMatricesBufferOffset + modelMatrix.byteLength + normalMatrix.byteLength, 256
            );
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
        passEncoder.setBindGroup(0, this.#context.uniformBindGroup);

        let firstVertex = 0;
        for (let m of this.#context.meshData) {
            passEncoder.setBindGroup(1, m.bindGroup);
            let vc = m.getVertexCount();
            passEncoder.draw(vc, 1, firstVertex);
            firstVertex += vc;
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
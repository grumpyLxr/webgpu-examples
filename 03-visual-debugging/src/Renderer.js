import {
    mat3,
    mat4,
} from '../imports/wgpu-matrix.module.js';
import * as utils from './utils.js';
import { Scene } from './Scene.js';
import { StandardRenderPass, TextureRenderMode } from './StandardRenderPass.js';
import { NormalsRenderPass } from './NormalsRenderPass.js';
import { WireframeRenderPass } from './WireframeRenderPass.js';
import { ObjectSelector, SelectionMode } from './ObjectSelector.js';


export class Renderer {
    #scene;
    #gpuDevice;
    #drawingContext;

    #gpuCamera;
    #gpuLights;
    #gpuMeshData;

    #standardRenderPass;
    #normalsRenderPass;
    #wireframeRenderPass;
    #objectSelector;

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
        this.#standardRenderPass = new StandardRenderPass();
        this.#normalsRenderPass = new NormalsRenderPass();
        this.#wireframeRenderPass = new WireframeRenderPass();
        this.#objectSelector = new ObjectSelector(gpuDevice, drawingContext);

        this.setColorTextureRenderMode(TextureRenderMode.Normal);
        this.setSpecularTextureRenderMode(TextureRenderMode.Normal);
        this.setNormalsTextureRenderMode(TextureRenderMode.Normal);
    }

    /**
     * Updates the renderer with the user's input.
     * 
     * @param {InputState} inputState the user input between the last update and this update
     */
    updateWithInputState(inputState) {
        if (inputState.colorTextureSwitch) {
            this.setColorTextureRenderMode(
                this.#nextTextureRenderMode(this.#standardRenderPass.getColorTextureMode())
            );
        }
        if (inputState.specularTextureSwitch) {
            this.setSpecularTextureRenderMode(
                this.#nextTextureRenderMode(this.#standardRenderPass.getSpecularTextureMode())
            );
        }
        if (inputState.normalTextureSwitch) {
            this.setNormalsTextureRenderMode(
                this.#nextTextureRenderMode(this.#standardRenderPass.getNormalTextureMode())
            );
        }
        this.#objectSelector.updateWithInputState(inputState);
    }

    setColorTextureRenderMode(mode) {
        this.#standardRenderPass.setColorTextureMode(mode);
        document.getElementById("tex-color-mode").textContent =
            this.#standardRenderPass.getColorTextureMode().name;
    }

    setSpecularTextureRenderMode(mode) {
        this.#standardRenderPass.setSpecularTextureMode(mode);
        document.getElementById("tex-specular-mode").textContent =
            this.#standardRenderPass.getSpecularTextureMode().name;
    }

    setNormalsTextureRenderMode(mode) {
        this.#standardRenderPass.setNormalTextureMode(mode);
        document.getElementById("tex-normal-mode").textContent =
            this.#standardRenderPass.getNormalTextureMode().name;
    }

    #nextTextureRenderMode(m) {
        if (m == TextureRenderMode.Normal) { return TextureRenderMode.Disabled; }
        if (m == TextureRenderMode.Disabled) { return TextureRenderMode.Exclusive; }
        if (m == TextureRenderMode.Exclusive) { return TextureRenderMode.Normal; }
    }

    async init() {
        const gpuDevice = this.#gpuDevice;

        // Create a vertex buffer to contain the vertex data of the meshes.
        const meshList = this.#scene.getMeshes()
        const vbByteSize = meshList.map(m => m.getVertices().byteLength).reduce((a, b) => a + b, 0);
        const vertexBuffer = gpuDevice.createBuffer({
            size: vbByteSize,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        const vertexBufferLayout = [meshList[0].getVertexLayout()];
        this.#gpuMeshData = {
            vertexBuffer: vertexBuffer,
            vertexBufferLayout: vertexBufferLayout,
            meshList: [],
            modelMatrices: []
        };
        var vbOffset = 0;
        var firstVertex = 0;
        for (let mesh of meshList) {
            const meshVertices = mesh.getVertices();
            utils.copyToBuffer(gpuDevice, vertexBuffer, meshVertices, vbOffset);
            this.#gpuMeshData.meshList.push({
                vertexCount: mesh.getVertexCount(),
                firstVertex: firstVertex
            });
            firstVertex += mesh.getVertexCount();
            vbOffset += meshVertices.byteLength;
        }

        // Create a texture that can be used for the depth buffer.
        const depthTexture = gpuDevice.createTexture({
            size: [this.#drawingContext.canvas.width, this.#drawingContext.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Create a uniform buffer for the VP (View-Projection) matrix
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        const cameraBuffer = gpuDevice.createBuffer({
            size: utils.align(utils.mat4ByteLength + utils.vec3ByteLength + 3 * utils.i32ByteLength, 16),
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.#gpuCamera = {
            buffer: cameraBuffer,
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

        // Create uniform buffer for the model matrics:
        var modelMatrixStructByteLength = utils.mat4ByteLength + utils.mat3ByteLength;
        var bindGroupByteLength = utils.align(modelMatrixStructByteLength, 256);
        const modelMatricesBuffer = gpuDevice.createBuffer({
            size: bindGroupByteLength * meshList.length,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        var bufferOffset = 0;
        for (let mesh of meshList) {
            this.#gpuMeshData.modelMatrices.push({
                buffer: modelMatricesBuffer,
                bufferOffset: bufferOffset,
                byteLength: modelMatrixStructByteLength,
                getModelMatrix: function () { return mesh.getModelMatrix(); },
                setModelMatrix: function (m) {
                    utils.copyToBuffer(gpuDevice, modelMatricesBuffer, m, this.bufferOffset);
                },
                setNormalMatrix: function (m) {
                    utils.copyToBuffer(gpuDevice, modelMatricesBuffer, m, this.bufferOffset + utils.mat4ByteLength);
                },
                createBindGroup: function(renderPipeline, groupNumber) {
                    return utils.createBindGroup(gpuDevice, renderPipeline, groupNumber, [{
                        buffer: this.buffer, offset: this.bufferOffset, size: this.byteLength
                    }]);
                }
            });
            bufferOffset += bindGroupByteLength;
        }

        // Create a uniform buffer for the Light
        // round to a multiple of 16 to match wgsl struct size (see https://www.w3.org/TR/WGSL/#alignment-and-size).
        const lights = this.#scene.getLights()
        const lightByteLengths = utils.align(lights[0].getLightData().byteLength, 16);
        const lightBuffer = gpuDevice.createBuffer({
            size: lightByteLengths * lights.length,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.#gpuLights = {
            buffer: lightBuffer,
            setLight: function (i, light) {
                utils.copyToBuffer(gpuDevice, lightBuffer, light, i * lightByteLengths);
            }
        }

        await this.#standardRenderPass.init(gpuDevice, depthTexture, this.#gpuCamera, this.#gpuLights, this.#gpuMeshData);
        await this.#normalsRenderPass.init(gpuDevice, depthTexture, this.#gpuCamera, this.#gpuMeshData);
        await this.#wireframeRenderPass.init(gpuDevice, depthTexture, this.#gpuCamera, this.#gpuMeshData);
        await this.#objectSelector.init(depthTexture, this.#gpuCamera, this.#gpuMeshData);
    }

    /**
     * Renders the next frame.
     */
    async renderFrame() {
        this.#updateGpuData(this.#gpuCamera, this.#gpuLights);

        this.#objectSelector.onRenderFrame();

        // Create GPUCommandEncoder to issue commands to the GPU
        // Note: render pass descriptor, command encoder, etc. are destroyed after use, fresh one needed for each frame.
        const commandEncoder = this.#gpuDevice.createCommandEncoder();

        this.#standardRenderPass.renderFrame(this.#drawingContext, commandEncoder);

        // First render wireframes and then normals. This way the normals are rendered above
        // the wireframe and are visible at all times.
        this.#wireframeRenderPass.renderFrame(
            this.#drawingContext,
            commandEncoder,
            this.#objectSelector.getFirstSelectedVertex(),
            this.#objectSelector.getNumSelectedVertices()
        );
        this.#normalsRenderPass.renderFrame(
            this.#drawingContext,
            commandEncoder,
            this.#objectSelector.getFirstSelectedVertex(),
            this.#objectSelector.getNumSelectedVertices(),
            this.#objectSelector.getSelectionMode() == SelectionMode.Face
        );

        // End frame by passing array of command buffers to command queue for execution
        this.#gpuDevice.queue.submit([commandEncoder.finish()]);
    }

    #updateGpuData(gpuCamera, gpuLights) {
        // Pass MVP (Model/View/Projection) matrices to the shader:
        const camera = this.#scene.getCamera();
        const vpMatrix = camera.getViewProjectionMatrix(this.#drawingContext.canvas);
        gpuCamera.setVpMatrix(vpMatrix);
        gpuCamera.setCameraPosition(camera.getPosition());

        // Pass Light data to the shader:
        const lights = this.#scene.getLights();
        for (let i = 0; i < lights.length; ++i) {
            gpuLights.setLight(i, lights[i].getLightData())
        }

        for (let m of this.#gpuMeshData.modelMatrices) {
            const modelMatrix = m.getModelMatrix();
            // The normal vectors cannot be multiplied with the model matrix. If the model matrix 
            // performs non-uniform scaling, the normals would not be perpendicular to the surface anymore.
            // See http://www.lighthouse3d.com/tutorials/glsl-12-tutorial/the-normal-matrix/
            const normalMatrix = mat3.fromMat4(mat4.transpose(mat4.inverse(modelMatrix)));
            m.setModelMatrix(modelMatrix);
            m.setNormalMatrix(normalMatrix);
        }
    }
}
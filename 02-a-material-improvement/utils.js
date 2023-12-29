import { vec3, mat3, mat4 } from './imports/wgpu-matrix.module.js';

export const vec3ByteLength = vec3.create().byteLength;
export const mat3ByteLength = mat3.create().byteLength;
export const mat4ByteLength = mat4.create().byteLength;
export const i32ByteLength = 4;

/**
 * Rounds the given number to a multiple of the alignment.
 * 
 * @param number {number} the number
 * @param alignment {number} the alignment
 * @returns the aligned number 
 */
export function align(number, alignment) {
    return Math.ceil(number / alignment) * alignment;
}

/**
 * Creates a bind group from the given layout.
 * @param {GPUDevice} gpuDevice the GPU device
 * @param {GPUBindGroupLayout} layout the bind group layout
 * @param {*} entries the bind group entries; an array of objects that will 
 *                      be used for the 'resource' property
 * @returns the bind group
 */
export function createBindGroupWithLayout(gpuDevice, layout, entries) {
    const completeEntries = entries.map((e, i) => {
        return {
            binding: i,
            resource: e,
        };
    });
    return gpuDevice.createBindGroup({
        layout: layout,
        entries: completeEntries
    });
}

/**
 * Creates a bind group from a layout of the given render pipeline.
 * @param {GPUDevice} gpuDevice the GPU device
 * @param {GPURenderPipeline} pipeline the pipeline that contains the bind group layout
 * @param {number} groupNumber the bind group number
 * @param {*} entries the bind group entries; an array of objects that will 
 *                      be used for the 'resource' property
 * @returns the bind group
 */
export function createBindGroup(gpuDevice, pipeline, groupNumber, entries) {
    const layout = pipeline.getBindGroupLayout(groupNumber);
    const group = createBindGroupWithLayout(gpuDevice, layout, entries);

    return {
        number: groupNumber,
        group: group
    }
}

/**
 * Copies the given data to a buffer on the GPU.
 * @param {GPUDevice} gpuDevice the GPU device
 * @param {GPUBuffer} buffer the GPU buffer 
 * @param {*} data the data to copy
 * @param {number} offset offset in the GPU buffer
 */
export function copyToBuffer(gpuDevice, buffer, data, offset = 0) {
    gpuDevice.queue.writeBuffer(
        buffer,
        offset,
        data.buffer,
        data.byteOffset,
        data.byteLength
    )
}

/**
 * Creates a texture from the given bitmap.
 * @param {GPUDevice} gpuDevice the GPU device
 * @param {ImageBitmap} bitmap the bitmap
 * @returns {GPUTexture} the texture
 */
export function createTextureFromBitmap(gpuDevice, bitmap, bitmapFormat = 'rgba') {
    const texture = gpuDevice.createTexture({
        size: [bitmap.width, bitmap.height, 1],
        format: bitmapFormat + '8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.RENDER_ATTACHMENT |
            GPUTextureUsage.COPY_DST,
    });
    gpuDevice.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: texture },
        [bitmap.width, bitmap.height]
    );
    return texture;
}
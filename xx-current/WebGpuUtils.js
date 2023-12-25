import { vec3, mat3, mat4 } from './imports/wgpu-matrix.module.js';

export const vec3ByteLength = vec3.create().byteLength
export const mat3ByteLength = mat3.create().byteLength
export const mat4ByteLength = mat4.create().byteLength

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

export function createUniformBindGroupLayout(gpuDevice, entries) {
    const completeEntries = entries.map((e, i) => {
        e['buffer'] = { type: "uniform" };
        e['binding'] = i;
        return e;
    });
    return gpuDevice.createBindGroupLayout({
        entries: completeEntries
    });
}

export function createBindGroup(gpuDevice, layout, entries) {
    const completeEntries = entries.map((e, i) => {
        return {
            binding: i,
            resource: {
                buffer: e.buffer,
                offset: e.offset,
                size: e.size,
            },
        };
    });
    return gpuDevice.createBindGroup({
        layout: layout,
        entries: completeEntries
    });
}

export function createUniformBindGroup(gpuDevice, layoutEntries, entries) {
    const layout = createUniformBindGroupLayout(gpuDevice, layoutEntries);
    const group = createBindGroup(gpuDevice, layout, entries);

    return {
        layout: layout,
        group: group
    }
}
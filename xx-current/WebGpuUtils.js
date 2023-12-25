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
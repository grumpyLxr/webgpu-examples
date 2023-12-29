import {
    vec3,
} from './imports/wgpu-matrix.module.js';

export class Light {
    #position;
    #color;
    #range;
    #ambientStrength;
    #diffuseStrength;
    #specularStrength;

    /**
     * Creates a new light
     * @param {vec3} position the position of the light
     * @param {vec3} color the color of the light
     * @param {number} range the maximum range of the light; after that range the light has no effect anymore
     * @param {number} strength the strength / brightness of the light
     * @param {number} ambientFraction the fraction of the light that is ambient and lights all surfaces within the light range
     */
    constructor(
        position = vec3(0.0, 0.0, 0.0),
        color = vec3(1.0, 1.0, 1.0),
        range = 1.0,
        strength = 1.0,
        ambientFraction = 0.3333) {
        if (ambientFraction < 0.0 || ambientFraction > 1.0) {
            throw Error("ambientFraction must be between 0.0 and 1.0.");
        }

        this.#position = position;
        this.#color = color;
        this.#range = range;
        this.#ambientStrength = strength * ambientFraction;
        this.#diffuseStrength = strength * (1 - this.#ambientStrength);
        this.#specularStrength = this.#diffuseStrength;
    }

    getLightData() {
        let b = new Array();
        b = b.concat(Array.from(this.#position));
        b.push(0.0); // vec3f allignment; see https://www.w3.org/TR/WGSL/#alignment-and-size
        b = b.concat(Array.from(this.#color));
        b.push(this.#range);
        b.push(this.#ambientStrength);
        b.push(this.#diffuseStrength);
        b.push(this.#specularStrength);

        return new Float32Array(b);
    }
}
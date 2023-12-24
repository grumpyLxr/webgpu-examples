import {
    vec3,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';

export class Light {
    #position = vec3.create(0.0, -1.0, -2.0);
    #color = vec3.create(1.0, 1.0, 0.5);
    #range = 4.0;
    #ambientStrength = 0.4;
    #diffuseStrength = 0.8;
    #specularStrength = 0.3;

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
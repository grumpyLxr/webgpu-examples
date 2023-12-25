import {
    vec3,
    mat4
} from './imports/wgpu-matrix.module.js';

const cubeVertices = [
    vec3.fromValues(-1, -1, -1),
    vec3.fromValues(1, -1, -1),
    vec3.fromValues(1, 1, -1),
    vec3.fromValues(-1, 1, -1),
    vec3.fromValues(-1, -1, 1),
    vec3.fromValues(-1, 1, 1),
    vec3.fromValues(1, -1, 1),
    vec3.fromValues(1, 1, 1),
];

const cubeFaces = new Uint16Array([
    // front
    2, 1, 0,
    3, 2, 0,
    // left
    4, 3, 0,
    3, 4, 5,
    // back
    6, 5, 4,
    5, 6, 7,
    // right
    1, 7, 6,
    1, 2, 7,
    // top
    0, 1, 6,
    0, 6, 4,
    // bottom
    2, 3, 5,
    2, 5, 7,
])

export class CubeMesh {

    #position = vec3.create(0.0, 0.0, 0.0);
    #rotationAxis = vec3.create(1.0, 0.0, 0.0);
    #rotationRad = 0.0;
    #vertexData

    constructor(
        color = vec3.create(1.0, 1.0, 1.0),
        specularStrength = 1.0,
        specularShininess = 32.0) {
        this.#calcVertexData(color, specularStrength, specularShininess)
    }

    /**
     * Moves the cube to a specific position.
     * @param {vec3} position the position to which the cube is moved
     */
    moveTo(position) {
        this.#position = position;
    }

    setRotation(rotationAxis, rotationRad) {
        this.#rotationAxis = rotationAxis;
        this.#rotationRad = rotationRad;
    }

    getVertices() {
        return this.#vertexData;
    }

    getVertexCount() {
        return this.#vertexData.length / 11;
    }

    getTriangleCount() {
        return this.getVertexCount() / 3;
    }

    getModelMatrix() {
        const modelMatrix = mat4.identity();
        mat4.rotate(
            modelMatrix,
            this.#rotationAxis,
            this.#rotationRad,
            modelMatrix
        );
        mat4.translate(modelMatrix, this.#position, modelMatrix);
        return modelMatrix;
    }

    #calcVertexData(color, specularStrength, specularShininess) {
        let vd = new Array()
        for (var i = 0; i < cubeFaces.length; i += 3) {
            const v1 = cubeVertices[cubeFaces[i + 0]];
            const v2 = cubeVertices[cubeFaces[i + 1]];
            const v3 = cubeVertices[cubeFaces[i + 2]];
            const d1 = vec3.sub(v1, v2);
            const d2 = vec3.sub(v1, v3);
            const normal = vec3.normalize(vec3.cross(d1, d2));

            vd = vd.concat(Array.from(v1));
            vd = vd.concat(Array.from(normal));
            vd = vd.concat(Array.from(color));
            vd.push(specularStrength);
            vd.push(specularShininess);

            vd = vd.concat(Array.from(v2));
            vd = vd.concat(Array.from(normal));
            vd = vd.concat(Array.from(color));
            vd.push(specularStrength);
            vd.push(specularShininess);

            vd = vd.concat(Array.from(v3));
            vd = vd.concat(Array.from(normal));
            vd = vd.concat(Array.from(color));
            vd.push(specularStrength);
            vd.push(specularShininess);
        }
        this.#vertexData = new Float32Array(vd)
    }
}
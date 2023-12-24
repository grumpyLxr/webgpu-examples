import {
    vec3,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';

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

const cubeColors = [
    // front
    vec3.fromValues(1, 1, 0),
    vec3.fromValues(1, 1, 0),
    // left
    vec3.fromValues(1, 1, 1),
    vec3.fromValues(1, 1, 1),
    // back
    vec3.fromValues(0, 1, 1),
    vec3.fromValues(0, 1, 1),
    // right
    vec3.fromValues(1, 1, 1),
    vec3.fromValues(1, 1, 1),
    // top
    vec3.fromValues(1, 0, 1),
    vec3.fromValues(1, 0, 1),
    // bottom
    vec3.fromValues(0.5, 1, 0.5),
    vec3.fromValues(0.5, 1, 0.5),
];


export class CubeMesh {
    #vertexData

    constructor() {
        this.#calcVertexData()
    }

    #calcVertexData() {
        let vd = new Array()
        for (var i = 0; i < cubeFaces.length; i += 3) {
            const v1 = cubeVertices[cubeFaces[i + 0]];
            const v2 = cubeVertices[cubeFaces[i + 1]];
            const v3 = cubeVertices[cubeFaces[i + 2]];
            const color = cubeColors[i / 3];
            const d1=vec3.sub(v1, v2);
            const d2=vec3.sub(v1, v3);
            const normal = vec3.normalize(vec3.cross(d1, d2));

            vd = vd.concat(Array.from(v1));
            vd = vd.concat(Array.from(normal));
            vd = vd.concat(Array.from(color));

            vd = vd.concat(Array.from(v2));
            vd = vd.concat(Array.from(normal));
            vd = vd.concat(Array.from(color));
            
            vd = vd.concat(Array.from(v3));
            vd = vd.concat(Array.from(normal));
            vd = vd.concat(Array.from(color));
        }
        this.#vertexData = new Float32Array(vd)
    }

    getVertices() {
        return this.#vertexData;
    }

    getVertexCount() {
        return this.#vertexData.length / 9;
    }

    getTriangleCount() {
        return this.getVertexCount() / 3;
    }
}
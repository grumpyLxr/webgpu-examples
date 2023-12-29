import {
    vec2,
    vec3,
    mat4
} from './imports/wgpu-matrix.module.js';

const cubeVertices = [
    vec3.fromValues(-1, -1, -1),  // 0
    vec3.fromValues(1, -1, -1),   // 1
    vec3.fromValues(1, 1, -1),    // 2
    vec3.fromValues(-1, 1, -1),   // 3
    vec3.fromValues(-1, -1, 1),   // 4
    vec3.fromValues(-1, 1, 1),    // 5
    vec3.fromValues(1, -1, 1),    // 6
    vec3.fromValues(1, 1, 1),     // 7
];

const cubeFaces = new Uint16Array([
    // front
    0, 3, 1,
    1, 3, 2,
    // left    
    4, 5, 0,
    0, 5, 3,
    // back
    6, 7, 4,
    4, 7, 5,
    // right
    1, 2, 6,
    6, 2, 7,
    // top
    4, 0, 6,
    6, 0, 1,
    // bottom
    3, 5, 2,
    2, 5, 7,
]);

// Texture coordinates for each face of the cube.
const texCoords = [
    vec2.fromValues(0, 0),
    vec2.fromValues(0, 1),
    vec2.fromValues(1, 0),
    vec2.fromValues(1, 0),
    vec2.fromValues(0, 1),
    vec2.fromValues(1, 1),
];

export class CubeMesh {

    #position = vec3.create(0.0, 0.0, 0.0);
    #rotationAxis = vec3.create(1.0, 0.0, 0.0);
    #rotationRad = 0.0;
    #vertexData

    constructor(isSolid = true, specularShininess = 32.0, scale = 1.0) {
        this.#calcVertexData(isSolid, specularShininess, scale)
    }

    /**
     * Moves the cube to a specific position.
     * @param {vec3} position the position to which the cube is moved
     */
    moveTo(position) {
        this.#position = position;
    }

    /**
     * Rotates the cube around the given axis.
     * @param {vec3} rotationAxis the axix around which the cube is rotated
     * @param {number} rotationRad the angle by which to rotate in radiant
     */
    setRotation(rotationAxis, rotationRad) {
        this.#rotationAxis = rotationAxis;
        this.#rotationRad = rotationRad;
    }

    getVertices() {
        return this.#vertexData;
    }

    getVertexCount() {
        return this.#vertexData.length / 15;
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
    
    #calcVertexData(isSolid, specularShininess, scale) {
        const scaleMatrix = mat4.scale(
            mat4.identity(), vec3.create(1 * scale, 1 * scale, (isSolid ? 1 : -1) * scale)
        );

        let vd = new Array();
        for (var i = 0; i < cubeFaces.length; i += 3) {
            var v1 = cubeVertices[cubeFaces[i + 0]];
            var v2 = cubeVertices[cubeFaces[i + 1]];
            var v3 = cubeVertices[cubeFaces[i + 2]];

            v1 = vec3.transformMat4(v1, scaleMatrix);
            v2 = vec3.transformMat4(v2, scaleMatrix);
            v3 = vec3.transformMat4(v3, scaleMatrix);

            const edge1 = vec3.sub(v1, v2);
            const edge2 = vec3.sub(v1, v3);
            const faceNormal = vec3.normalize(vec3.cross(edge1, edge2));

            const t1 = vec2.scale(texCoords[i % 6 + 0], scale);
            const t2 = vec2.scale(texCoords[i % 6 + 1], scale);
            const t3 = vec2.scale(texCoords[i % 6 + 2], scale);

            // Calculate Tangent and Bitangent that are used for normal mapping.
            // This works if the normal vector is the same for all vertices and 
            // perpendicular to the face.
            // If each vertex uses a different normal (e.g. normales of adjacent 
            // faces are smoothed) we have to calculate tantent and bitangent
            // vectors for each vertex. In addition to that if the normals
            // are not perpendicular to the face we have to re-orthogonalize
            // the tangent, bitangent and normal vectors. 
            const tangentCoordinates = this.#calcTangentAndBitangent(
                edge1, edge2, vec2.sub(t1, t2), vec2.sub(t1, t3)
            );

            vd = vd.concat(Array.from(v1));
            vd = vd.concat(Array.from(faceNormal));
            vd = vd.concat(Array.from(tangentCoordinates.t));
            vd = vd.concat(Array.from(tangentCoordinates.b));
            vd = vd.concat(Array.from(t1));
            vd.push(specularShininess);

            vd = vd.concat(Array.from(v2));
            vd = vd.concat(Array.from(faceNormal));
            vd = vd.concat(Array.from(tangentCoordinates.t));
            vd = vd.concat(Array.from(tangentCoordinates.b));
            vd = vd.concat(Array.from(t2));
            vd.push(specularShininess);

            vd = vd.concat(Array.from(v3));
            vd = vd.concat(Array.from(faceNormal));
            vd = vd.concat(Array.from(tangentCoordinates.t));
            vd = vd.concat(Array.from(tangentCoordinates.b));
            vd = vd.concat(Array.from(t3));
            vd.push(specularShininess);
        }
        this.#vertexData = new Float32Array(vd)
    }

    /**
     * Calculate Tangent and Bitangent that are used for normal mapping.
     * 
     * @param {vec3} edge1 vector between two vertices of a triangle
     * @param {vec3} edge2 vector between two different vertices of a triangle
     * @param {vec2} texEdge1 difference in the texture coordinates of the two vertices of edge1
     * @param {vec2} texEdge2 difference in the texture coordinates of the two vertices of edge2
     * @returns 
     */
    #calcTangentAndBitangent(edge1, edge2, texEdge1, texEdge2) {
        let f = 1.0 / (texEdge1[0] * texEdge2[1] - texEdge2[0] * texEdge1[1]);
        let tangent = vec3.create(
            f * (texEdge2[1] * edge1[0] - texEdge1[1] * edge2[0]),
            f * (texEdge2[1] * edge1[1] - texEdge1[1] * edge2[1]),
            f * (texEdge2[1] * edge1[2] - texEdge1[1] * edge2[2]),
        );
        let bitangent = vec3.create(
            f * (-texEdge2[0] * edge1[0] + texEdge1[0] * edge2[0]),
            f * (-texEdge2[0] * edge1[1] + texEdge1[0] * edge2[1]),
            f * (-texEdge2[0] * edge1[2] + texEdge1[0] * edge2[2]),
        );
        return { t: vec3.normalize(tangent), b: vec3.normalize(bitangent) }
    }
}
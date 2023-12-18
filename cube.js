// Vertex data for triangle
// Each vertex has 8 values representing position and color: X Y Z W R G B A
const vertices = new Float32Array([
  -1, -1, 0, 1, 1, 0, 0, 1,
   1, -1, 0, 1, 0, 1, 0, 1,
   1,  1, 0, 1, 0, 0, 1, 1,
  -1,  1, 0, 1, 0, 1, 1, 1,
  -1, -1, 1, 1, 0, 1, 1, 1,
  -1,  1, 1, 1, 0, 1, 1, 1,
   1, -1, 1, 1, 0, 1, 0, 1,
   1,  1, 1, 1, 0, 1, 1, 1,
]);
const vertexCount = vertices.length / 8;

const triangles = new Uint16Array([
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
  // Array byte size must be a multiple of 4 otherwise writeBuffer() failes
  // 0xFF
]);

export function cubeGetVertices() {
	return vertices;
}

export function cubeGetVertexCount() {
	return vertexCount;
}

export function cubeGetTriangles() {
  return triangles;
}

export function cubeGetTriangleCount() {
  return triangles.length / 3;
}
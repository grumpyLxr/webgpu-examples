override LINE_LENGTH:f32 = 1.0;
override NORMAL_VERTEXT_TYPE:i32;
override TANGENT_VERTEXT_TYPE:i32;
override BITANGENT_VERTEXT_TYPE:i32;
const NORMAL_COLOR:vec4f = vec4f(0.0, 0.5, 1.0, 1.0);
const TANGENT_COLOR:vec4f = vec4f(1.0, 0.0, 0.0, 1.0);
const BITANGENT_COLOR:vec4f = vec4f(0.0, 1.0, 0.2, 1.0);

struct Camera {
    // The View-Projection matrix
    vpMatrix: mat4x4f,
    // The position of the camera in world space
    cameraPosition: vec3f,
}
@group(0) @binding(0) var<uniform> camera : Camera;

struct ModelMatrices {
    modelMatrix: mat4x4f,
    normalMatrix: mat3x3f,
}
@group(1) @binding(0) var<uniform> matrices : ModelMatrices;

struct VertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) texTangent: vec3f,
    @location(3) texBitangent: vec3f,

    @location(15) vertexAndLineType: i32,
}

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(1) color: vec4f,
}

@vertex
fn vertex_main(in: VertexIn) -> VertexOut {
    var out: VertexOut;

    // Lower 16 Bits contain the vertex type, uper 16 bits contain the line type.
    // The line type is the same for the two vertices that define a line.
    // The vertex type is different for two vertices that define a line.
    let vertexType = (in.vertexAndLineType << 16) >> 16;
    let lineType = (in.vertexAndLineType >> 16);

    var vert = in.position;
    if vertexType == NORMAL_VERTEXT_TYPE {
        vert += (in.normal * LINE_LENGTH);
    } else if vertexType == TANGENT_VERTEXT_TYPE {
        vert += (in.texTangent * LINE_LENGTH);
    } else if vertexType == BITANGENT_VERTEXT_TYPE {
        vert += (in.texBitangent * LINE_LENGTH);
    }

    let worldPosition = matrices.modelMatrix * vec4(vert, 1.0);
    var clipPosition = camera.vpMatrix * worldPosition;

    // Move the normals a little bit closer to the camera so that it passes the depth buffer test.
    // To do this we convert the z position from Clip-Space to NDC (normalized device coordinates)
    // that are between [0; 1].
    let ndcPositionZ = clipPosition.z / clipPosition.w;
    clipPosition.z = (ndcPositionZ - 0.01 * (1 - ndcPositionZ)) * clipPosition.w;
    out.position = clipPosition;

    if lineType == NORMAL_VERTEXT_TYPE {
        out.color = NORMAL_COLOR;
    } else if lineType == TANGENT_VERTEXT_TYPE {
        out.color = TANGENT_COLOR;
    } else if lineType == BITANGENT_VERTEXT_TYPE {
        out.color = BITANGENT_COLOR;
    }

    return out;
}

@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
    return in.color;
}
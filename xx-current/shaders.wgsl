struct MvpMatrixBuffer {
    vpMatrix: mat4x4<f32>,
    modelMatrix: mat4x4<f32>,
}
@binding(0) @group(0) var<uniform> mvp : MvpMatrixBuffer;

// Vertex Shader: ------------------------------------------------------------
struct VertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) color: vec3f
}

struct VertexOut {
    @builtin(position) clipPosition: vec4f,
    @location(0) worldPosition: vec3f,
    @location(1) normal: vec3f,
    @location(2) color: vec3f,
}

@vertex
fn vertex_main(in: VertexIn) -> VertexOut {
    var output: VertexOut;
    var vec4WorldPosition = mvp.modelMatrix * vec4(in.position, 1.0);
    output.clipPosition = mvp.vpMatrix * vec4WorldPosition;
    output.worldPosition = vec3(vec4WorldPosition[0], vec4WorldPosition[1], vec4WorldPosition[2]);
    var vec4WorldNormal = mvp.modelMatrix * vec4(in.normal, 0.0);
    output.normal =  vec3(vec4WorldNormal[0], vec4WorldNormal[1], vec4WorldNormal[2]);
    output.color = in.color;
    return output;
}

// Fragment Shader: ------------------------------------------------------------
@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
    const lightPosition = vec3(2.0, 0.0, -2.0);
    const lightColor = vec3(1.0, 1.0, 1.0);
    const lightRange = 5.0;
    const ambientStrength = 0.2;
    const diffuseStrength = 1.0;
    
    var lightDirection = lightPosition - in.worldPosition;
    var lightDistance = length(lightDirection);
    var lightStrength = max(lightRange - lightDistance, 0.0) / lightRange;

    var ambientColor = lightColor * ambientStrength * lightStrength;
    var diffuseFactor = max(dot(normalize(lightDirection), in.normal), 0.0);
    var diffuseColor = lightColor * diffuseStrength * diffuseFactor * lightStrength;

    return vec4(
        in.color * (ambientColor + diffuseColor),
        1.0
    );
}

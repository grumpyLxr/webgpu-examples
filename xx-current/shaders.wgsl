struct MvpMatrixBuffer {
    // The View-Projection matrix
    vpMatrix: mat4x4f,
    modelMatrix: mat4x4f,
    normalMatrix: mat3x3f,
    // The position of the camera in world space
    cameraPosition: vec3f
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

    let vec4WorldPosition = mvp.modelMatrix * vec4(in.position, 1.0);
    output.clipPosition = mvp.vpMatrix * vec4WorldPosition;
    output.worldPosition = vec3(vec4WorldPosition.xyz);

    // The normal vectors cannot be multiplied with the model matrix. If the model matrix 
    // performs non-uniform scaling, the normals would not be perpendicular to the surface anymore.
    // See http://www.lighthouse3d.com/tutorials/glsl-12-tutorial/the-normal-matrix/
    output.normal = mvp.normalMatrix * in.normal;

    output.color = in.color;

    return output;
}

// Fragment Shader: ------------------------------------------------------------
@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
    // Local illumination with Phong lighting in world space:
    const lightPosition = vec3(0.0, -1.0, -2.0);
    const lightColor = vec3(1.0, 1.0, 1.0);
    const lightRange = 4.0;
    const ambientStrength = 0.4;
    const diffuseStrength = 0.8;
    const specularStrength = 0.3;

    const materialShininess = 32;

    let relativeLightPosition = lightPosition - in.worldPosition;
    let lightDistance = length(relativeLightPosition);

    var resultLightColor: vec3f;
    if lightRange < lightDistance {
        resultLightColor = vec3(0.0, 0.0, 0.0);
    } else {
        let lightStrength = (lightRange - lightDistance) / lightRange;
        let lightDirection = normalize(relativeLightPosition);
        let fragmentNormal = normalize(in.normal);

        let ambientColor = lightColor * ambientStrength;

        let diffuseFactor = max(dot(lightDirection, fragmentNormal), 0.0);
        let diffuseColor = lightColor * diffuseStrength * diffuseFactor;

        let viewDirection = normalize(mvp.cameraPosition - in.worldPosition);
        let reflectDirection = reflect(-lightDirection, fragmentNormal);
        let specularFactor = pow(max(dot(viewDirection, reflectDirection), 0.0), materialShininess);
        let specularColor = lightColor * specularStrength * specularFactor;

        resultLightColor = (ambientColor + diffuseColor + specularColor) * lightStrength;
    }

    return vec4(in.color * resultLightColor, 1.0);
}

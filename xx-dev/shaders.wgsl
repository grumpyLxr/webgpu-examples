struct Camera {
    // The View-Projection matrix
    vpMatrix: mat4x4f,
    // The position of the camera in world space
    cameraPosition: vec3f
}
@group(0) @binding(0) var<uniform> camera : Camera;

@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var theTexture: texture_2d<f32>;

struct ModelMatrices {
    modelMatrix: mat4x4f,
    normalMatrix: mat3x3f,
}
@group(1) @binding(0) var<uniform> matrices : ModelMatrices;

struct Light {
    position: vec3f,
    color: vec3f,
    range: f32,
    ambientStrength: f32,
    diffuseStrength: f32,
    specularStrength: f32,
}
@group(2) @binding(0) var<storage, read> lights : array<Light>;

// Vertex Shader: ------------------------------------------------------------
struct VertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) texCoord: vec2f,
    @location(3) specularStrength: f32,
    @location(4) specularShininess: f32,
}

struct VertexOut {
    @builtin(position) clipPosition: vec4f,
    @location(0) worldPosition: vec3f,
    @location(1) normal: vec3f,
    @location(2) texCoord: vec2f,
    @location(3) specularStrength: f32,
    @location(4) specularShininess: f32,
}

@vertex
fn vertex_main(in: VertexIn) -> VertexOut {
    var output: VertexOut;

    let vec4WorldPosition = matrices.modelMatrix * vec4(in.position, 1.0);
    output.clipPosition = camera.vpMatrix * vec4WorldPosition;
    output.worldPosition = vec3(vec4WorldPosition.xyz);

    // The normal vectors cannot be multiplied with the model matrix. If the model matrix 
    // performs non-uniform scaling, the normals would not be perpendicular to the surface anymore.
    // See http://www.lighthouse3d.com/tutorials/glsl-12-tutorial/the-normal-matrix/
    output.normal = matrices.normalMatrix * in.normal;

    output.texCoord = in.texCoord;
    output.specularStrength = in.specularStrength;
    output.specularShininess = in.specularShininess;

    return output;
}

// Fragment Shader: ------------------------------------------------------------

// Calculates the color contribution of a point light to a fragment.
// Local illumination with Blinn-Phong lighting in world space.
fn calcPointLight(
    light: Light,
    fragmentPosition: vec3f,
    fragmentNormal: vec3f,
    viewDirection: vec3f,
    matSpecularStrength: f32,
    matSpecularShininess: f32
) -> vec3f {
    let relativeLightPosition = light.position - fragmentPosition;
    let lightDistance = length(relativeLightPosition);

    var resultLightColor: vec3f;
    if light.range < lightDistance {
        return vec3(0.0, 0.0, 0.0);
    } else {
        let lightStrength = (light.range - lightDistance) / light.range; // linear falloff
        let lightDirection = normalize(relativeLightPosition);

        let ambientColor = light.color * light.ambientStrength;

        let diffuseFactor = max(dot(lightDirection, fragmentNormal), 0.0);
        let diffuseColor = light.color * light.diffuseStrength * diffuseFactor;

        let halfwayDirection = normalize(lightDirection + viewDirection);
        let specularFactor = pow(max(dot(fragmentNormal, halfwayDirection), 0.0), matSpecularShininess);
        let specularColor = light.color * matSpecularStrength * light.specularStrength * specularFactor;

        return (ambientColor + diffuseColor + specularColor) * lightStrength;
    }
}

@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
    let viewDirection = normalize(camera.cameraPosition - in.worldPosition);
    let fragmentNormal = normalize(in.normal);

    var lightColor = vec3(0.0, 0.0, 0.0);
    for (var i:u32 = 0; i < arrayLength(&lights); i += 1) {
        lightColor += calcPointLight(
            lights[i], in.worldPosition, fragmentNormal, viewDirection, in.specularStrength, in.specularShininess
        );
    }

    let matColor = textureSample(theTexture, texSampler, in.texCoord);
    return matColor * vec4(lightColor, 1.0);
}

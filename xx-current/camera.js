import {
	vec3,
	mat4,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';


export function getViewProjectionMatrix(canvas) {
	const aspect = canvas.width / canvas.height;
	const fieldOfView = (2 * Math.PI) / 5;
	const projectionMatrix = mat4.perspective(
		fieldOfView,
		aspect,
		0.1,
		100.0
	);

	const viewMatrix = mat4.identity();
	mat4.translate(viewMatrix, vec3.fromValues(0, 0, -4), viewMatrix);

	const viewProjectionMatrix = mat4.create();
    mat4.multiply(projectionMatrix, viewMatrix, viewProjectionMatrix);
	return viewProjectionMatrix;
}

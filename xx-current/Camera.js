import {
	vec3,
	mat4,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';

const initialDirection = vec3.fromValues(0, 0, 1)

export class Camera {
	#position; // camera position
	#yaw; // rotation left-right in radiant
	#pitch; // rotation up-down in radiant
	#direction; // the direction into which camera is looking; calculated from #yaw and #pitch
	#up; // the up vector of the camera

	constructor() {
		this.reset()
	}

	/**
	 * Sets the camera to the initial position.
	 */
	reset() {
		this.#position = vec3.fromValues(0, 0, -4);
		this.#yaw = 0.0;
		this.#pitch = 0.0;
		this.#direction = vec3.copy(initialDirection);
		this.#up = vec3.fromValues(0, -1, 0);
	}

	/**
	 * Rotates the camera by a delta from the current rotation.
	 * @param {number} yawDelta the amount to rotate left (negative number) or right (positive number) in radian
	 * @param {number} pitchDelta the ammount to rotate up (positive number) or down (negative number) in radian
	 */
	rotate(yawDelta, pitchDelta) {
		this.#yaw += yawDelta
		this.#pitch += pitchDelta
		this.#pitch = Math.min(Math.PI - 0.1, Math.max(-(Math.PI - 0.1), this.#pitch));
		
		const rot = mat4.identity();
		mat4.rotateY(rot, this.#yaw, rot);
		mat4.rotateX(rot, this.#pitch, rot);
		vec3.transformMat4(initialDirection, rot, this.#direction);
	}

	/**
	 * Moves the camera by a delta from the current position.
	 * @param {number} forwardBackwardDelta the amount to move forward (positive number) or backward (negative number)
	 * @param {number} leftRightDelta the amount to move left (negative number) or right (positive number)
	 */
	move(forwardBackwardDelta, leftRightDelta) {
		const translateForwardBackward = vec3.scale(this.#direction, forwardBackwardDelta)
		vec3.add(this.#position, translateForwardBackward, this.#position)

		const directionLeft = vec3.normalize(vec3.cross(this.#direction, this.#up));
		const translateLeftRight = vec3.scale(directionLeft, leftRightDelta)
		vec3.add(this.#position, translateLeftRight, this.#position)
	}

	/**
	 * Returns the combined view and projection matrix for the camera.
	 * 
	 * @param {HTMLCanvasElement} canvas the canvas that is used to render the scene
	 * @returns the view and projection matrix
	 */
	getViewProjectionMatrix(canvas) {
		const aspect = canvas.width / canvas.height;
		const fieldOfView = (2 * Math.PI) / 5;
		const projectionMatrix = mat4.perspective(
			fieldOfView,
			aspect,
			0.1,
			100.0
		);

		const camTarget = vec3.add(this.#position, this.#direction)
		const viewMatrix = mat4.lookAt(this.#position, camTarget, this.#up);

		const viewProjectionMatrix = mat4.create();
		mat4.multiply(projectionMatrix, viewMatrix, viewProjectionMatrix);
		return viewProjectionMatrix;
	}

}
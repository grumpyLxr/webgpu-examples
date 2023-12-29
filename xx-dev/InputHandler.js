export class InputState {
    constructor() {
        this.rotateLeftRight = 0;
        this.rotateUpDown = 0;
        this.left = false;
        this.right = false;
        this.forward = false;
        this.backward = false;
        this.resetCamera = false;
        this.colorTextureSwitch = false;
        this.specularTextureSwitch = false;
        this.normalTextureSwitch = false;
    }
}

export class InputHandler {
    #rotationSpeed = 0.01
    #state = new InputState()

    constructor(canvas) {
        canvas.addEventListener('pointermove', (e) => this.#handleMouseEvent(e));
        window.addEventListener('keydown', (e) => this.#handleKeyboardEvent(e, true));
        window.addEventListener('keyup', (e) => this.#handleKeyboardEvent(e, false));
    }

    /**
     * Returns the current input state and resets the input state of the InputHandler.
     * @returns the current input state
     */
    getInputState() {
        const currentState = this.#state;
        this.#state = new InputState()
        return currentState;
    }

    #handleMouseEvent(event) {
        const mouseDown = event.pointerType == 'mouse' ? (event.buttons & 1) !== 0 : true;
        if (mouseDown) {
            this.#state.rotateLeftRight += event.movementX * this.#rotationSpeed;
            this.#state.rotateUpDown += event.movementY * this.#rotationSpeed * -1;
        }
    }

    #handleKeyboardEvent(event, value) {
        let handled = false;
        switch (event.code) {
            case 'KeyW':
                this.#state.forward ||= value;
                handled = true;
                break;
            case 'KeyS':
                this.#state.backward ||= value;
                handled = true;
                break;
            case 'KeyA':
                this.#state.left ||= value;
                handled = true;
                break;
            case 'KeyD':
                this.#state.right ||= value;
                handled = true;
                break;
            case 'KeyR':
                this.#state.resetCamera ||= value;
                handled = true;
                break;
            case 'KeyC':
                this.#state.colorTextureSwitch ||= value;
                handled = true;
                break;
            case 'KeyV':
                this.#state.specularTextureSwitch ||= value;
                handled = true;
                break;
            case 'KeyB':
                this.#state.normalTextureSwitch ||= value;
                handled = true;
                break;
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
}
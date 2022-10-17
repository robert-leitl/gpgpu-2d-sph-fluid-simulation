import { vec2 } from "gl-matrix";
import { filter, fromEvent, merge, throwIfEmpty } from "rxjs";
import * as twgl from "twgl.js";

import drawVert from './shader/draw.vert.glsl';
import drawFrag from './shader/draw.frag.glsl';
import integrateVert from './shader/integrate.vert.glsl';
import integrateFrag from './shader/integrate.frag.glsl';
import pressureVert from './shader/pressure.vert.glsl';
import pressureFrag from './shader/pressure.frag.glsl';
import forceVert from './shader/force.vert.glsl';
import forceFrag from './shader/force.frag.glsl';

export class Sketch {

    TARGET_FRAME_DURATION = 16;
    #time = 0; // total time
    #deltaTime = 0; // duration betweent the previous and the current animation frame
    #frames = 0; // total framecount according to the target frame duration
    // relative frames according to the target frame duration (1 = 60 fps)
    // gets smaller with higher framerates --> use to adapt animation timing
    #deltaFrames = 0;

    // particle constants
    NUM_PARTICLES = 1000;

    constructor(canvasElm, onInit = null) {
        this.canvas = canvasElm;
        this.onInit = onInit;

        this.#init();
    }

    run(time = 0) {
        this.#deltaTime = Math.min(32, time - this.#time);
        this.#time = time;
        this.#deltaFrames = this.#deltaTime / this.TARGET_FRAME_DURATION;
        this.#frames += this.#deltaFrames

        this.#animate(this.#deltaTime);
        this.#render();

        requestAnimationFrame((t) => this.run(t));
    }

    resize() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.viewportSize = vec2.set(
            this.viewportSize,
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );

        this.domainScale = vec2.copy(vec2.create(), this.viewportSize);
        const maxSize = Math.max(this.domainScale[0], this.domainScale[1]) * 0.5;
        this.domainScale[0] /= maxSize;
        this.domainScale[1] /= maxSize;

        const needsResize = twgl.resizeCanvasToDisplaySize(this.canvas);

        if (needsResize) {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
    }

    #init() {
        this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false });

        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        twgl.addExtensionsToContext(gl);

        this.viewportSize = vec2.fromValues(
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );

        this.#initTextures();

        this.drawPrg = twgl.createProgramInfo(gl, [drawVert, drawFrag]);
        this.integratePrg = twgl.createProgramInfo(gl, [integrateVert, integrateFrag]);
        this.pressurePrg = twgl.createProgramInfo(gl, [pressureVert, pressureFrag]);
        this.forcePrg = twgl.createProgramInfo(gl, [forceVert, forceFrag]);

        this.quadBufferInfo = twgl.createBufferInfoFromArrays(gl, { a_position: { numComponents: 2, data: [-1, -1, 3, -1, -1, 3] }});

        this.pressureFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.densityPressure}], this.textureSize, this.textureSize);
        this.forceFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.force}], this.textureSize, this.textureSize);
        this.integrateFBOs = [
            twgl.createFramebufferInfo(gl, [{attachment: this.textures.position1},{attachment: this.textures.velocity1}], this.textureSize, this.textureSize),
            twgl.createFramebufferInfo(gl, [{attachment: this.textures.position2},{attachment: this.textures.velocity2}], this.textureSize, this.textureSize)
        ];

        this.fboNdx = 0;

        this.#initEvents();

        this.resize();
        
        if (this.onInit) this.onInit(this);
    }

    #initEvents() {
        this.isPointerDown = false;
        this.pointerPos = vec2.create();
        this.smoothPointerPos = vec2.create();
        this.prevSmoothPointerPos = vec2.create();
        this.smoothPointerForce = vec2.create();

        fromEvent(this.canvas, 'pointerdown').subscribe((e) => {
            this.isPointerDown = true;
            vec2.set(this.pointerPos, e.clientX, e.clientY);
            vec2.copy(this.smoothPointerPos, this.pointerPos);
            vec2.copy(this.prevSmoothPointerPos, this.smoothPointerPos);
        });
        merge(
            fromEvent(this.canvas, 'pointerup'),
            fromEvent(this.canvas, 'pointerleave')
        ).subscribe(() => this.isPointerDown = false);
        fromEvent(this.canvas, 'pointermove').pipe(
            filter(() => this.isPointerDown)
        ).subscribe((e) => {
            vec2.set(this.pointerPos, e.clientX, e.clientY);
        });
    }

    #initTextures() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.textureSize = 2**Math.ceil(Math.log2(Math.sqrt(this.NUM_PARTICLES)));

        // update the particle size to fill the texture space
        this.NUM_PARTICLES = this.textureSize * this.textureSize;

        const initVelocities = new Float32Array(this.NUM_PARTICLES * 4);
        const initForces = new Float32Array(this.NUM_PARTICLES * 4);
        const initPositions = new Float32Array(this.NUM_PARTICLES * 4);

        for(let i=0; i<this.NUM_PARTICLES; ++i) {
            initVelocities[i * 4 + 0] = 0;
            initVelocities[i * 4 + 1] = 0;
            initPositions[i * 4 + 0] = Math.random() * 2 - 1;
            initPositions[i * 4 + 1] = Math.random() * 2 - 1;
        }

        const defaultOptions = {
            width: this.textureSize,
            height: this.textureSize,
            min: gl.NEAREST, 
            mag: gl.NEAREST,
        }

        const defaultVectorTexOptions = {
            ...defaultOptions,
            format: gl.RGBA,
            internalFormat: gl.RGBA32F, 
        }

        this.textures = twgl.createTextures(gl, { 
            densityPressure: {
                ...defaultOptions,
                format: gl.RG, 
                internalFormat: gl.RG32F, 
                src: new Float32Array(this.NUM_PARTICLES * 2)
            },
            force: { ...defaultVectorTexOptions, src: [...initForces] },
            position1: { ...defaultVectorTexOptions, src: [...initPositions] },
            position2: { ...defaultVectorTexOptions, src: [...initPositions] },
            velocity1: { ...defaultVectorTexOptions, src: [...initVelocities] },
            velocity2: { ...defaultVectorTexOptions, src: [...initVelocities] },
        });
    }

    #animate(deltaTime) {
        this.smoothPointerPos[0] += (this.pointerPos[0] - this.smoothPointerPos[0]) / 5;
        this.smoothPointerPos[1] += (this.pointerPos[1] - this.smoothPointerPos[1]) / 5;
        vec2.subtract(this.smoothPointerForce, this.smoothPointerPos, this.prevSmoothPointerPos);
        vec2.copy(this.prevSmoothPointerPos, this.smoothPointerPos);

        const normalizedPointerPos = vec2.fromValues(
            (this.smoothPointerPos[0] / this.viewportSize[0]) * 2. - 1, 
            (1 - (this.smoothPointerPos[1] / this.viewportSize[1])) * 2. - 1
        );
        const normalizedPointerVelocity = vec2.fromValues(this.smoothPointerForce[0], -this.smoothPointerForce[1]);

        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.integrateInFBO = this.integrateFBOs[this.fboNdx];
        // swap the buffers for next iteration
        this.fboNdx = (this.fboNdx + 1) % 2;
        this.integrateOutFBO = this.integrateFBOs[this.fboNdx];


        gl.useProgram(this.pressurePrg.program);
        twgl.bindFramebufferInfo(gl, this.pressureFBO);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        twgl.setBuffersAndAttributes(gl, this.pressurePrg, this.quadBufferInfo);
        twgl.setUniforms(this.pressurePrg, { 
            u_positionTexture: this.integrateInFBO.attachments[0], 
            u_particleCount: this.NUM_PARTICLES,
            u_domainScale: this.domainScale
        });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);



        gl.useProgram(this.forcePrg.program);
        twgl.bindFramebufferInfo(gl, this.forceFBO);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        twgl.setBuffersAndAttributes(gl, this.forcePrg, this.quadBufferInfo);
        twgl.setUniforms(this.forcePrg, { 
            u_densityPressureTexture: this.pressureFBO.attachments[0],
            u_positionTexture: this.integrateInFBO.attachments[0], 
            u_velocityTexture: this.integrateInFBO.attachments[1], 
            u_particleCount: this.NUM_PARTICLES,
            u_domainScale: this.domainScale
        });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);



        gl.useProgram(this.integratePrg.program);
        twgl.bindFramebufferInfo(gl, this.integrateOutFBO);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        twgl.setBuffersAndAttributes(gl, this.integratePrg, this.quadBufferInfo);
        twgl.setUniforms(this.integratePrg, { 
            u_positionTexture: this.integrateInFBO.attachments[0], 
            u_velocityTexture: this.integrateInFBO.attachments[1],
            u_forceTexture: this.forceFBO.attachments[0],
            u_densityPressureTexture: this.pressureFBO.attachments[0],
            u_pointerPos: normalizedPointerPos,
            u_pointerVelocity: normalizedPointerVelocity,
            u_dt: deltaTime,
            u_domainScale: this.domainScale
        });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);
    }

    #render() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        twgl.bindFramebufferInfo(gl, null);
        gl.clearColor(0., 0., 0., 1.);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(this.drawPrg.program);
        twgl.setUniforms(this.drawPrg, { 
            u_positionTexture: this.integrateOutFBO.attachments[0],
            u_velocityTexture: this.integrateOutFBO.attachments[1] 
        });
        gl.drawArrays(gl.POINTS, 0, this.NUM_PARTICLES);
    }
}
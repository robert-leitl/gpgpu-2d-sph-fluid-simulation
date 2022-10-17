import { filter, fromEvent, merge, retryWhen } from "rxjs";
import { Vector2 } from "three";
import { resizeCanvasToDisplaySize } from "./utils/webgl-utils";

// SPH Implementation inspired from https://lucasschuermann.com/writing/implementing-sph-in-2d
// https://github.com/mjwatkins2/WebGL-SPH

class SPHParticle {
    constructor(x, y) {
        this.rho = 0; // density
        this.p = 0; // pressure
        this.s = new Vector2(x, y); // position
        this.v = new Vector2(); // velocity
        this.f = new Vector2(); // force
    }

    reset(rho) {
        this.f.set(0, 0);
        this.rho = rho;
    }
}

class SPHSimulation {

    particles = [];

    constructor() {}

    init(count, size) {
        this.size = size.clone();
        this.count = count;
        this.H = 1;
        this.HSQ = this.H * this.H;

        const spread = Math.floor(Math.sqrt((this.size.x * this.size.y) / count));
        this.scale = this.H / spread;
        this.size.multiplyScalar(this.scale);
        this.center = this.size.clone().multiplyScalar(0.5);
        this.grid = new Vector2(Math.floor(this.size.x / this.H), Math.floor(this.size.y / this.H));

        // constants
        this.REST_DENS = 1.55;  // rest density
        this.GAS_CONST = 200;   // const for equation of state
        this.MASS = 1;          // assume all particles have the same mass
        this.VISC = 10;         // viscosity constant

        // smoothing kernels
        this.POLY6 = 315.0 / (64 * Math.PI * Math.pow(this.H, 9));
        this.SPIKY_GRAD = -45.0 / (Math.PI * Math.pow(this.H, 6));
        this.VISC_LAP = 45.0 / (Math.PI * Math.pow(this.H, 5));

        // simulation parameters
        this.BOUND_DAMPING = -0.5;
        
        // distribute the particles as a centered grid inside the simulation size
        const particleGrid = this.grid.clone();
        const posFactor = .5; // grid spacing factor
        particleGrid.x = Math.floor(particleGrid.x / posFactor);
        particleGrid.y = Math.floor(particleGrid.y / posFactor);
        const ox = this.size.x - (this.H * (particleGrid.x - 1) * posFactor);
        const oy = this.size.y - (this.H * (particleGrid.y - 1) * posFactor);
        for (let j=0; j<particleGrid.y; ++j) {
            for (let i=0; i<particleGrid.x; ++i) {
                const p = new SPHParticle(i * this.H * posFactor + ox/2, j * this.H * posFactor + oy/2);
                // reset density
                p.rho = this.MASS * this.#poly6Weight(0);
                
                this.particles.push(p);
            }
        }

        // temp calc values
        this.forcePressure = new Vector2();
        this.forceViscosity = new Vector2();
    }

    toSimulationSpace(pos) {
        return pos.clone().multiplyScalar(this.scale);
    }

    toWorldSpace(pos) {
        return pos.clone().multiplyScalar(1 / this.scale);
    }

    update(deltaTime) {
        this.#computeDensityPressure();
        this.#computeForces();
        this.#integrate(deltaTime * 0.0015);
    }

    applyExternalForce(pos, force) {
        this.externalForcePos = pos;
        this.externalForce = force;
    }

    #poly6Weight(r2) {
        let temp = Math.max(0, this.HSQ - r2);
        return this.POLY6 * temp * temp * temp;
    }

    #spiky_grad2Weight(r) {
        let temp = Math.max(0, this.H - r);
        return (this.SPIKY_GRAD * temp * temp) / r;
    }

    #visc_laplWeight(r) {
        return this.VISC_LAP * (1 - r / this.H);
    }

    #computeDensityPressure() {
        this.particles.forEach(pi => {
            this.particles.forEach(pj => {
               // if (pi === pj) return;

                this.#computeParticleDensities(pi, pj);
            });

            // update the pressure
            pi.p = Math.max(this.GAS_CONST * (pi.rho - (this.REST_DENS)), 0);
        });
    }

    #computeParticleDensities(pi, pj) {
        const r2 = pi.s.distanceToSquared(pj.s);
        if (r2 < this.HSQ) {
            let t = this.MASS * this.#poly6Weight(r2);
            pi.rho += t;
        }
    }

    #computeForces() {
        this.particles.forEach(pi => {
            this.particles.forEach(pj => { 
                //if (pi === pj) return;

                this.#computeParticleForces(pi, pj);
            });

            this.#computeBoundaryForces(pi);
        });

        this.#computeExternalForces();
    }

    #computeParticleForces(pi, pj) {
        const r_ij = pj.s.clone().sub(pi.s);
        const r2 = r_ij.lengthSq();

        if (r2 < this.HSQ) {
            const r = Math.sqrt(r2) + 1e-9;

            this.forcePressure.set(0, 0);
            this.forceViscosity.set(0, 0);

            // compute pressure force contribution
            let pF = this.MASS * ((pi.p + pj.p) / (2 * pj.rho)) * this.#spiky_grad2Weight(r);
            this.forcePressure.copy(r_ij);
            this.forcePressure.multiplyScalar(pF);

            // compute viscosity force contribution
            const deltaVelocity = pj.v.clone().sub(pi.v);
            this.forceViscosity.add(deltaVelocity.multiplyScalar(this.VISC * this.MASS * this.#visc_laplWeight(r) / pj.rho));

            const totalForce = this.forcePressure.clone().add(this.forceViscosity);

            pi.f.add(totalForce);
        }
    }

    #computeBoundaryForces(pi) {
        const xmin = 0;
        const xmax = this.size.x;
        const ymin = 0;
        const ymax = this.size.y;
        const h = this.H;
        const f = (this.MASS / (pi.rho + 1e-9)) * (pi.p * 1);

        if (pi.s.x < xmin + h) {
            let r = pi.s.x - xmin;
            pi.f.x -= f * this.#spiky_grad2Weight(r) * r;
        } else if (pi.s.x > xmax - h) {
            let r = xmax - pi.s.x;
            pi.f.x += f * this.#spiky_grad2Weight(r) * r;
        }
        if (pi.s.y < ymin + h) {
            let r = pi.s.y - ymin;
            pi.f.y -= f * this.#spiky_grad2Weight(r) * r;
        } else if (pi.s.y > ymax - h) {
            let r = ymax - pi.s.y;
            pi.f.y += f * this.#spiky_grad2Weight(r) * r;
        }
    }

    #computeExternalForces() {
        if (this.externalForce) {
            this.particles
                .map(pi => [pi, this.externalForcePos.distanceToSquared(pi.s)])
                .filter(([pi, r2]) => r2 < .5)
                .forEach(([pi, r2]) => {
                    pi.v.copy(this.externalForce).multiplyScalar(0.5);
                    pi.f.set(0, 0);
                });
            this.externalForce = null;
        }
    }

    #integrate(deltaTime) {
        const xmin = 0;
        const xmax = this.size.x;
        const ymin = 0;
        const ymax = this.size.y;

        for (let p of this.particles) {

            let v = p.f.clone().multiplyScalar(deltaTime * (1 / p.rho));
            p.v.add(v);

            v = v.multiplyScalar(0.5);
            p.s.add(p.v.clone().add(v).multiplyScalar(deltaTime));

            const bounceFactor = 0;
            if (p.s.x < xmin) {
                p.s.x = xmin + 1e-6;
                p.v.x *= bounceFactor;
            }
            else if (p.s.x > xmax) {
                p.s.x = xmax - 1e-6;
                p.v.x *= bounceFactor;
            }
            if (p.s.y < ymin) {
                p.s.y = ymin + 1e-6;
                p.v.y *= bounceFactor;
            } else if (p.s.y > ymax) {
                p.s.y = ymax - 1e-6;
                p.v.y *= bounceFactor;
            }

            // reset particle
            p.rho = this.MASS * this.#poly6Weight(0);
            p.f.set(0, 0);

            this.externalForceCell = null;
        }
    }
}


export class Sketch {

    TARGET_FRAME_DURATION = 16;
    #time = 0; // total time
    #deltaTime = 0; // duration betweent the previous and the current animation frame
    #frames = 0; // total framecount according to the target frame duration
    // relative frames according to the target frame duration (1 = 60 fps)
    // gets smaller with higher framerates --> use to adapt animation timing
    #deltaFrames = 0;

    viewportSize = new Vector2();


    simulation = new SPHSimulation();

    constructor(canvasElm, onInit = null, isDev = false, pane = null) {
        this.canvas = canvasElm;
        this.onInit = onInit;
        this.pane = pane;
        this.isDev = isDev;

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
        this.viewportSize.set(this.canvas.clientWidth, this.canvas.clientHeight)

        const needsResize = resizeCanvasToDisplaySize(this.canvas);
        
        if (needsResize) {
        }
    }

    #init() {
        this.viewportSize.set(this.canvas.clientWidth, this.canvas.clientHeight)
        this.simulationSize = new Vector2(1200, 1200);

        this.ctx = this.canvas.getContext("2d");

        this.#initSimulation();

        this.#initEvents();

        this.#initTweakpane();

        this.resize();
        
        if (this.onInit) this.onInit(this);
    }

    #initSimulation() {
        this.simulation.init(200, this.simulationSize);
    }

    #initEvents() {
        this.isPointerDown = false;
        this.pointerPos = new Vector2();
        this.smoothPointerPos = new Vector2();
        this.prevSmoothPointerPos = new Vector2();
        this.smoothPointerForce = new Vector2();

        fromEvent(this.canvas, 'pointerdown').subscribe((e) => {
            this.isPointerDown = true;
            this.pointerPos.set(e.clientX, e.clientY);
            this.smoothPointerPos.copy(this.pointerPos);
            this.prevSmoothPointerPos.copy(this.pointerPos);
        });
        merge(
            fromEvent(this.canvas, 'pointerup'),
            fromEvent(this.canvas, 'pointerleave')
        ).subscribe(() => this.isPointerDown = false);
        fromEvent(this.canvas, 'pointermove').pipe(
            filter(() => this.isPointerDown)
        ).subscribe((e) => {
            this.pointerPos.set(e.clientX, e.clientY);
        });
    }

    #initTweakpane() {
        if (!this.pane) return;

        /*for(let folder in this.#settings) {
            const f = this.pane.addFolder({
                expanded: this.isDev,
                title: folder,
            });

            for(let prop in this.#settings[folder]) {
                f.addInput(this.#settings[folder], prop);
            }
        }*/
    }

    #animate(deltaTime) {
        this.smoothPointerPos.x += (this.pointerPos.x - this.smoothPointerPos.x) / 5;
        this.smoothPointerPos.y += (this.pointerPos.y - this.smoothPointerPos.y) / 5;
        this.smoothPointerForce.copy(this.smoothPointerPos);
        this.smoothPointerForce.sub(this.prevSmoothPointerPos);
        this.prevSmoothPointerPos.copy(this.smoothPointerPos);

        if (this.isPointerDown && this.smoothPointerForce.lengthSq() > 0.01) {
            this.simulation.applyExternalForce(
                this.simulation.toSimulationSpace(this.smoothPointerPos), 
                this.smoothPointerForce.multiplyScalar(1)
            );
        }
        
        for(let i=0; i<1; ++i) {
            this.simulation.update(deltaTime / 1);
        }
    }

    #render() {
        const ctx = this.ctx;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = '#bbb';
        this.simulation.particles.forEach(particle => {
            const pos = this.simulation.toWorldSpace(particle.s);
            ctx.beginPath();
            ctx.ellipse(
                pos.x, 
                pos.y, 
                4, 
                4, 
                0, 
                0,
                Math.PI * 2
            );
            ctx.fill();
        });

        ctx.beginPath();
        ctx.strokeStyle = 'white';
        ctx.rect(0, 0, this.simulationSize.x, this.simulationSize.y);
        ctx.stroke();
    }
}
export class VolumeDataGenerator {
    constructor(size = 128) {
        this.size = size;
    }

    generateGalaxyDensity(timestep = 0) {
        const data = new Float32Array(this.size * this.size * this.size);
        const center = this.size / 2;
        const time = timestep / 100;

        for (let z = 0; z < this.size; z++) {
            for (let y = 0; y < this.size; y++) {
                for (let x = 0; x < this.size; x++) {
                    const dx = x - center;
                    const dy = y - center;
                    const dz = z - center;

                    const r = Math.sqrt(dx * dx + dy * dy);
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    const maxDist = this.size / 2;

                    let density = Math.exp(-dist * dist / (maxDist * maxDist * 0.25));

                    const height = Math.abs(dz);
                    const diskFalloff = Math.exp(-height * height / (maxDist * maxDist * 0.05));
                    density *= 0.3 + 0.7 * diskFalloff;

                    const angle = Math.atan2(dy, dx);
                    const spiralAngle = angle + r * 0.05 + time * Math.PI * 2;
                    const spiralMod = (Math.sin(spiralAngle * 4) + 1) / 2;
                    density *= 0.6 + 0.4 * spiralMod;

                    const armRadius = r * (1 + 0.3 * Math.sin(spiralAngle * 2));
                    const armMod = Math.exp(-Math.abs(armRadius - r) / (maxDist * 0.1));
                    density *= 0.5 + 0.5 * armMod;

                    const noise = this.perlinNoise(x * 0.1, y * 0.1, z * 0.1 + time);
                    density += noise * 0.15;

                    const index = z * this.size * this.size + y * this.size + x;
                    data[index] = Math.max(0, Math.min(1, density));
                }
            }
        }

        return data;
    }

    perlinNoise(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const zf = z - Math.floor(z);
        
        const u = this.fade(xf);
        const v = this.fade(yf);
        const w = this.fade(zf);
        
        const p = this.getPermutation();
        
        const a = p[X] + Y;
        const aa = p[a] + Z;
        const ab = p[a] + Z + 1;
        const b = p[X + 1] + Y;
        const ba = p[b] + Z;
        const bb = p[b] + Z + 1;
        
        const x1 = this.lerp(
            this.grad(p[aa], xf, yf, zf),
            this.grad(p[ba], xf - 1, yf, zf),
            u
        );
        const x2 = this.lerp(
            this.grad(p[ab], xf, yf - 1, zf),
            this.grad(p[bb], xf - 1, yf - 1, zf),
            u
        );
        const y1 = this.lerp(x1, x2, v);
        
        const x3 = this.lerp(
            this.grad(p[aa + 1], xf, yf, zf - 1),
            this.grad(p[ba + 1], xf - 1, yf, zf - 1),
            u
        );
        const x4 = this.lerp(
            this.grad(p[ab + 1], xf, yf - 1, zf - 1),
            this.grad(p[bb + 1], xf - 1, yf - 1, zf - 1),
            u
        );
        const y2 = this.lerp(x3, x4, v);
        
        return (this.lerp(y1, y2, w) + 1) / 2;
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(a, b, t) {
        return a + t * (b - a);
    }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    getPermutation() {
        if (!this._p) {
            this._p = new Uint8Array(512);
            for (let i = 0; i < 256; i++) {
                this._p[i] = i;
            }
            for (let i = 255; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this._p[i], this._p[j]] = [this._p[j], this._p[i]];
            }
            for (let i = 0; i < 256; i++) {
                this._p[i + 256] = this._p[i];
            }
        }
        return this._p;
    }

    compressToUint8(data) {
        const uint8Data = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            uint8Data[i] = Math.floor(data[i] * 255);
        }
        return uint8Data;
    }

    generateMIP(axis = 'z') {
        const data = this.generateGalaxyDensity();
        const mipData = new Float32Array(this.size * this.size);
        
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                let maxVal = 0;
                for (let z = 0; z < this.size; z++) {
                    let index;
                    if (axis === 'x') {
                        index = z * this.size * this.size + y * this.size + x;
                    } else if (axis === 'y') {
                        index = z * this.size * this.size + x * this.size + y;
                    } else {
                        index = x * this.size * this.size + y * this.size + z;
                    }
                    maxVal = Math.max(maxVal, data[index]);
                }
                mipData[y * this.size + x] = maxVal;
            }
        }
        
        return mipData;
    }
}

const vecAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vecSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vecMul = (a, b) => [a[0] * b, a[1] * b, a[2] * b];
const normalize = (v) => {
  const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (m <= 0) return v;
  return [v[0] / m, v[1] / m, v[2] / m];
};

class Camera {
  constructor(canvas, position = [0, 0, 0], rotation = [0, 0, 0]) {
    Object.assign(this, {
      position,
      rotation,
      front: [0, 0, 1],
      right: [0, 0, 0],
      up: [0, 0, 0],
      keys: {},
    });

    this.updateVectors();

    window.addEventListener("keydown", (e) => {
      this.keys[e.key] = true;
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.key] = false;
    });

    canvas.addEventListener("mousemove", (event) => {
      this.rotation[1] -= event.movementX / canvas.width;
      this.rotation[0] += event.movementY / canvas.height;
      this.rotation[0] = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, this.rotation[0])
      );
      this.updateVectors();
    });

    canvas.addEventListener("click", async () => {
      await canvas.requestPointerLock();
    });
  }

  update(deltaTime) {
    let mov = [0, 0, 0];

    if (this.keys["w"]) {
      mov = vecAdd(mov, this.front);
    }

    if (this.keys["a"]) {
      mov = vecAdd(mov, this.right);
    }

    if (this.keys["s"]) {
      mov = vecSub(mov, this.front);
    }

    if (this.keys["d"]) {
      mov = vecSub(mov, this.right);
    }

    if (this.keys["q"]) {
      mov = vecSub(mov, this.up);
    }

    if (this.keys["e"]) {
      mov = vecAdd(mov, this.up);
    }

    if (this.keys["f"]) {
      deltaTime *= 0.05;
    }
    this.position = vecAdd(this.position, vecMul(normalize(mov), deltaTime));
  }

  updateVectors() {
    const sinX = Math.sin(this.rotation[0]);
    const sinY = Math.sin(this.rotation[1]);

    const cosX = Math.cos(this.rotation[0]);
    const cosY = Math.cos(this.rotation[1]);

    this.front = normalize([-sinY * cosX, -sinX, cosY * cosX]);
    this.right = normalize([-this.front[2], 0, this.front[0]]);
    this.up = normalize([
      this.right[2] * this.front[1],
      this.right[0] * this.front[2] - this.right[2] * this.front[0],
      -this.right[0] * this.front[1],
    ]);
  }
}

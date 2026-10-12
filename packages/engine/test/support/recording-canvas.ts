import { hashValues, round3 } from "./digest";

/**
 * RecordingCanvas — a deterministic, headless stand-in for OffscreenCanvas.
 *
 * Its 2D context draws nothing. It appends every call and property set
 * that the renderers make (stroke-renderer, composite, blitBuffer2D) to
 * a shared log, so "renders the same" can be checked headless by
 * comparing logs.
 *
 * Log entries are `[canvasId, name, ...args]`:
 * - numbers are rounded to 1e-3 (non-finite numbers become strings);
 * - a canvas argument is replaced by its id;
 * - an ImageData argument becomes `["ImageData", width, height, hash]`.
 *
 * A canvas gets its id, and logs `[id, "create", width, height]`, when it
 * first hands out a 2D context. `getContext` for any other kind returns
 * null without logging, so a WebGL probe falls back to the CPU path and
 * leaves no trace: deleting such a probe cannot change the log.
 *
 * `getImageData` returns zero-filled pixels.
 */

export type LogValue = number | string | boolean | null | LogValue[];
export type LogEntry = [number, string, ...LogValue[]];

interface Recorder {
  log: LogEntry[];
  nextId: number;
}

interface ImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

interface DrawState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  globalCompositeOperation: string;
}

const DEFAULT_STATE: DrawState = {
  fillStyle: "#000000",
  strokeStyle: "#000000",
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
};

function roundNumber(v: number): number | string {
  return Number.isFinite(v) ? round3(v) : String(v);
}

export class RecordingCanvas {
  width: number;
  height: number;
  /** Assigned when the canvas first hands out a 2D context or is drawn. */
  id: number | undefined;
  private ctx: RecordingContext2D | undefined;
  private readonly recorder: Recorder;

  constructor(width: number, height: number, recorder: Recorder) {
    this.width = width;
    this.height = height;
    this.recorder = recorder;
  }

  getContext(kind: string): RecordingContext2D | null {
    if (kind !== "2d") return null;
    if (!this.ctx) {
      this.ctx = new RecordingContext2D(this, this.recorder);
      this.recorder.log.push([
        canvasId(this, this.recorder),
        "create",
        roundNumber(this.width),
        roundNumber(this.height),
      ] as LogEntry);
    }
    return this.ctx;
  }
}

function canvasId(canvas: RecordingCanvas, recorder: Recorder): number {
  if (canvas.id === undefined) canvas.id = recorder.nextId++;
  return canvas.id;
}

function isImageData(v: object): v is ImageDataLike {
  return "data" in v && "width" in v && "height" in v && v.data instanceof Uint8ClampedArray;
}

export class RecordingContext2D {
  readonly canvas: RecordingCanvas;
  private readonly recorder: Recorder;
  private state: DrawState = { ...DEFAULT_STATE };
  private readonly stack: DrawState[] = [];

  constructor(canvas: RecordingCanvas, recorder: Recorder) {
    this.canvas = canvas;
    this.recorder = recorder;
  }

  private record(name: string, args: unknown[]): void {
    const entry: LogEntry = [canvasId(this.canvas, this.recorder), name];
    for (const a of args) entry.push(this.normalize(a));
    this.recorder.log.push(entry);
  }

  private normalize(a: unknown): LogValue {
    if (typeof a === "number") return roundNumber(a);
    if (typeof a === "string" || typeof a === "boolean") return a;
    if (a === null || a === undefined) return null;
    if (a instanceof RecordingCanvas) return canvasId(a, this.recorder);
    if (typeof a === "object" && isImageData(a)) {
      return ["ImageData", a.width, a.height, hashValues(a.data)];
    }
    throw new Error(`RecordingContext2D: cannot record argument ${String(a)}`);
  }

  private setState<K extends keyof DrawState>(key: K, value: DrawState[K]): void {
    this.state[key] = value;
    this.record(key, [value]);
  }

  // ── State properties (every set is recorded) ───────────────────

  get fillStyle(): string {
    return this.state.fillStyle;
  }
  set fillStyle(v: string) {
    this.setState("fillStyle", v);
  }
  get strokeStyle(): string {
    return this.state.strokeStyle;
  }
  set strokeStyle(v: string) {
    this.setState("strokeStyle", v);
  }
  get lineWidth(): number {
    return this.state.lineWidth;
  }
  set lineWidth(v: number) {
    this.setState("lineWidth", v);
  }
  get lineCap(): string {
    return this.state.lineCap;
  }
  set lineCap(v: string) {
    this.setState("lineCap", v);
  }
  get lineJoin(): string {
    return this.state.lineJoin;
  }
  set lineJoin(v: string) {
    this.setState("lineJoin", v);
  }
  get globalAlpha(): number {
    return this.state.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.setState("globalAlpha", v);
  }
  get globalCompositeOperation(): string {
    return this.state.globalCompositeOperation;
  }
  set globalCompositeOperation(v: string) {
    this.setState("globalCompositeOperation", v);
  }

  // ── State stack and transform ──────────────────────────────────

  save(): void {
    this.stack.push({ ...this.state });
    this.record("save", []);
  }
  restore(): void {
    const prev = this.stack.pop();
    if (prev) this.state = prev;
    this.record("restore", []);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record("setTransform", [a, b, c, d, e, f]);
  }
  translate(x: number, y: number): void {
    this.record("translate", [x, y]);
  }
  scale(x: number, y: number): void {
    this.record("scale", [x, y]);
  }
  rotate(angle: number): void {
    this.record("rotate", [angle]);
  }

  // ── Paths and drawing ──────────────────────────────────────────

  beginPath(): void {
    this.record("beginPath", []);
  }
  closePath(): void {
    this.record("closePath", []);
  }
  moveTo(x: number, y: number): void {
    this.record("moveTo", [x, y]);
  }
  lineTo(x: number, y: number): void {
    this.record("lineTo", [x, y]);
  }
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void {
    const args: unknown[] = [x, y, radius, startAngle, endAngle];
    if (counterclockwise !== undefined) args.push(counterclockwise);
    this.record("arc", args);
  }
  stroke(): void {
    this.record("stroke", []);
  }
  fill(): void {
    this.record("fill", []);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.record("fillRect", [x, y, w, h]);
  }

  // ── Images ─────────────────────────────────────────────────────

  drawImage(image: RecordingCanvas, ...coords: number[]): void {
    this.record("drawImage", [image, ...coords]);
  }
  getImageData(x: number, y: number, w: number, h: number): ImageDataLike {
    this.record("getImageData", [x, y, w, h]);
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData(imageData: ImageDataLike, dx: number, dy: number): void {
    this.record("putImageData", [imageData, dx, dy]);
  }
}

export interface RecordingCanvasFactory {
  /** Typed as an OffscreenCanvas factory so it drops into GraphEnv.createCanvas. */
  createCanvas: (width: number, height: number) => OffscreenCanvas;
  /** Every recorded call, across all canvases this factory created, in call order. */
  log: LogEntry[];
}

/** A canvas factory whose canvases share one log and one id sequence. */
export function createRecordingCanvasFactory(): RecordingCanvasFactory {
  const recorder: Recorder = { log: [], nextId: 0 };
  return {
    createCanvas: (width, height) =>
      new RecordingCanvas(width, height, recorder) as unknown as OffscreenCanvas,
    log: recorder.log,
  };
}

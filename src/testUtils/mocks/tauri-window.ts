import { vi } from 'vitest';

let currentScaleFactor = 2;
let currentPosition = { x: 0, y: 0 };
let currentSize = { width: 600, height: 80 };

interface MockWindowGeometry {
  scaleFactor?: number;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export class PhysicalSize {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  toLogical(scaleFactor: number) {
    return {
      width: this.width / scaleFactor,
      height: this.height / scaleFactor,
    };
  }
}

export class PhysicalPosition {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  toLogical(scaleFactor: number) {
    return {
      x: this.x / scaleFactor,
      y: this.y / scaleFactor,
    };
  }
}

const mockWindow = {
  setSize: vi.fn(async (size?: { width: number; height: number }) => {
    if (size) {
      currentSize = { width: size.width, height: size.height };
    }
  }),
  setPosition: vi.fn(async (position?: { x: number; y: number }) => {
    if (position) {
      currentPosition = { x: position.x, y: position.y };
    }
  }),
  outerSize: vi.fn(async () => {
    return new PhysicalSize(
      currentSize.width * currentScaleFactor,
      currentSize.height * currentScaleFactor,
    );
  }),
  outerPosition: vi.fn(async () => {
    return new PhysicalPosition(
      currentPosition.x * currentScaleFactor,
      currentPosition.y * currentScaleFactor,
    );
  }),
  scaleFactor: vi.fn(async () => currentScaleFactor),
  hide: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  setFocus: vi.fn(async () => {}),
  startDragging: vi.fn(async () => {}),
};

export function getCurrentWindow() {
  return mockWindow;
}

export class LogicalSize {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

export class LogicalPosition {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

export function __setMockWindowGeometry(geometry: MockWindowGeometry) {
  if (geometry.scaleFactor !== undefined) {
    currentScaleFactor = geometry.scaleFactor;
  }
  if (geometry.position) {
    currentPosition = geometry.position;
  }
  if (geometry.size) {
    currentSize = geometry.size;
  }
}

export function __resetMockWindowGeometry() {
  currentScaleFactor = 2;
  currentPosition = { x: 0, y: 0 };
  currentSize = { width: 600, height: 80 };
  mockWindow.setSize.mockClear();
  mockWindow.setPosition.mockClear();
  mockWindow.outerSize.mockClear();
  mockWindow.outerPosition.mockClear();
  mockWindow.scaleFactor.mockClear();
  mockWindow.hide.mockClear();
  mockWindow.show.mockClear();
  mockWindow.setFocus.mockClear();
  mockWindow.startDragging.mockClear();
}

export { mockWindow as __mockWindow };

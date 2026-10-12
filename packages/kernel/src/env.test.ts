import { describe, expect, test } from "bun:test";
import { ENV_SOURCE, envOutputType, isEnvSource } from "./env";

describe("the $env source", () => {
  test("is the key $env", () => {
    expect(ENV_SOURCE).toBe("$env");
    expect(isEnvSource("$env")).toBe(true);
    expect(isEnvSource("env")).toBe(false);
  });

  test("declares width and height, both numbers", () => {
    expect(envOutputType("width")).toBe("number");
    expect(envOutputType("height")).toBe("number");
  });

  test("declares nothing else, Object.prototype's keys included", () => {
    expect(envOutputType("dpr")).toBeUndefined();
    expect(envOutputType("toString")).toBeUndefined();
  });
});

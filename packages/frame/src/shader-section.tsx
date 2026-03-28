"use client";

import dynamic from "next/dynamic";
import type { DevTuner as DevTunerComponent } from "~/components/dev-tuner";
import { flowFieldPatch } from "../../_lib/generative/patches";
import { ManifestoShader } from "./manifesto-shader";

type DevTunerProps = React.ComponentProps<typeof DevTunerComponent>;

const DevTuner =
  process.env.NODE_ENV === "development"
    ? dynamic<DevTunerProps>(
        () => import("~/components/dev-tuner").then((m) => m.DevTuner),
        { ssr: false },
      )
    : null;

const patch = flowFieldPatch;

export function ShaderSection() {
  if (!DevTuner) return <ManifestoShader patch={patch} />;
  return (
    <DevTuner
      name={patch.name}
      params={patch.params}
      className="absolute inset-0"
    >
      {(values) => <ManifestoShader patch={patch} config={values} />}
    </DevTuner>
  );
}

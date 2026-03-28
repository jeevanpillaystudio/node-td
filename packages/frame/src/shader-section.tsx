"use client";

import dynamic from "next/dynamic";
import type { DevTuner as DevTunerComponent } from "~/components/dev-tuner";
import { collectParams } from "../../_lib/generative/graph";
import { simplexFieldGraph } from "../../_lib/generative/patches";
import { ManifestoShader } from "./manifesto-shader";

type DevTunerProps = React.ComponentProps<typeof DevTunerComponent>;

const DevTuner =
  process.env.NODE_ENV === "development"
    ? dynamic<DevTunerProps>(
        () => import("~/components/dev-tuner").then((m) => m.DevTuner),
        { ssr: false },
      )
    : null;

const graph = simplexFieldGraph;

export function ShaderSection() {
  if (!DevTuner) return <ManifestoShader graph={graph} />;
  return (
    <DevTuner
      name={graph.name}
      params={collectParams(graph)}
      className="absolute inset-0"
    >
      {(values) => <ManifestoShader graph={graph} config={values} />}
    </DevTuner>
  );
}

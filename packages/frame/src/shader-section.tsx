"use client";

import dynamic from "next/dynamic";
import type { DevTuner as DevTunerComponent } from "~/components/dev-tuner";
import { ManifestoShader, FLOW_FIELD_PARAMS } from "./manifesto-shader";

type DevTunerProps = React.ComponentProps<typeof DevTunerComponent>;

const DevTuner =
  process.env.NODE_ENV === "development"
    ? dynamic<DevTunerProps>(
        () => import("~/components/dev-tuner").then((m) => m.DevTuner),
        { ssr: false },
      )
    : null;

export function ShaderSection() {
  if (!DevTuner) return <ManifestoShader />;
  return (
    <DevTuner
      name="FlowField"
      params={FLOW_FIELD_PARAMS}
      className="absolute inset-0"
    >
      {(values) => <ManifestoShader config={values} />}
    </DevTuner>
  );
}
